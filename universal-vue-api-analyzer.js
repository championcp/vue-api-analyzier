const fs = require('fs');
const path = require('path');

class UniversalVueApiAnalyzer {
  constructor(srcPath) {
    this.srcPath = srcPath;
    this.apiCache = new Map();
    this.urlConstantsCache = new Map();
    this.results = [];
    this.processedFiles = 0;
    this.totalFiles = 0;
  }

  // 跨平台路径规范化 - 统一转换为正斜杠
  normalizePath(inputPath) {
    // 统一将所有反斜杠转换为正斜杠（Windows也支持正斜杠）
    return inputPath.replace(/\\/g, '/');
  }

  // 通用方法：查找项目的src根目录（增强的跨平台路径处理）
  findSrcRootPath() {
    // 使用规范化的路径进行处理
    let currentPath = this.normalizePath(path.resolve(this.srcPath));
    
    // 如果当前路径就是src目录或以src结尾
    if (currentPath.endsWith('/src')) {
      return currentPath;
    }
    
    // 向上查找直到找到包含src目录的路径
    const pathParts = currentPath.split('/');
    
    for (let i = pathParts.length; i > 0; i--) {
      const testPath = pathParts.slice(0, i).join('/');
      const potentialSrcPath = testPath + '/src';
      
      // 需要将路径转回本地格式来检查文件是否存在
      const localPath = potentialSrcPath.replace(/\//g, path.sep);
      if (fs.existsSync(localPath)) {
        return potentialSrcPath;
      }
    }
    
    // 如果没找到，使用传入路径构建
    return this.normalizePath(path.join(this.srcPath, 'src'));
  }

  // 动态解析URL常量映射
  preloadUrlConstants() {
    let srcRootPath = this.findSrcRootPath();
    
    // 查找baseUrl.js文件（支持多种常见位置）
    const baseUrlFiles = [
      srcRootPath + '/api/baseUrl.js',
      srcRootPath + '/utils/baseUrl.js',
      srcRootPath + '/config/baseUrl.js',
      srcRootPath + '/constants/baseUrl.js',
      srcRootPath + '/common/baseUrl.js'
    ];
    
    let baseUrlFile = null;
    for (const file of baseUrlFiles) {
      const localPath = file.replace(/\//g, path.sep);
      if (fs.existsSync(localPath)) {
        baseUrlFile = localPath;
        break;
      }
    }
    
    if (!baseUrlFile) {
      console.warn('警告: 未找到baseUrl.js文件，将无法解析URL常量');
      return;
    }
    
    this.parseBaseUrlFile(baseUrlFile);
  }

  // 解析baseUrl.js文件获取URL常量映射
  parseBaseUrlFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // 解析export函数，例如：export const API_URL = () => { return BASE_URL() }
      const exportFunctionRegex = /export\s+const\s+(\w+)\s*=\s*\(\s*\)\s*=>\s*\{[\s\S]*?return\s+([^}]+)[\s\S]*?\}/g;
      let match;
      
      while ((match = exportFunctionRegex.exec(content)) !== null) {
        const functionName = match[1];
        let returnValue = match[2].trim();
        
        // 解析return值
        const resolvedValue = this.resolveReturnValue(returnValue, content);
        
        // 存储映射（带花括号和不带花括号的版本）
        this.urlConstantsCache.set(`{${functionName}()}`, resolvedValue);
        this.urlConstantsCache.set(`${functionName}()`, resolvedValue);
      }
      
      // 解析简单的export const，例如：export const BASE_API = 'xxxx'
      const exportConstRegex = /export\s+const\s+(\w+)\s*=\s*['"`]([^'"`]+)['"`]/g;
      while ((match = exportConstRegex.exec(content)) !== null) {
        const constName = match[1];
        const constValue = match[2];
        this.urlConstantsCache.set(`{${constName}}`, constValue);
        this.urlConstantsCache.set(constName, constValue);
      }
      
      // 解析复杂的函数返回值，例如：SINGLE_APP() ? '' : '/api/v3'
      this.resolveComplexReturns(content);
      
    } catch (error) {
      console.error(`错误: 解析baseUrl.js文件失败: ${error.message}`);
    }
  }

  // 解析return值中的表达式
  resolveReturnValue(returnValue, content) {
    // 移除分号和空白
    returnValue = returnValue.replace(/;|\s+/g, '');
    
    // 处理三元表达式：SINGLE_APP() ? '' : '/api/v3'
    const ternaryMatch = returnValue.match(/\w+\(\)\s*\?\s*['"`]([^'"`]*)['"`]\s*:\s*['"`]([^'"`]+)['"`]/);
    if (ternaryMatch) {
      // 通常选择非空的值作为URL前缀
      return ternaryMatch[1] || ternaryMatch[2];
    }
    
    // 处理函数调用：BASE_URL()
    const functionCallMatch = returnValue.match(/(\w+)\(\)/);
    if (functionCallMatch) {
      const funcName = functionCallMatch[1];
      // 递归解析
      return this.findFunctionDefinition(funcName, content);
    }
    
    // 处理字符串字面量
    const stringMatch = returnValue.match(/['"`]([^'"`]+)['"`]/);
    if (stringMatch) {
      return stringMatch[1];
    }
    
    return returnValue;
  }

  // 查找函数定义
  findFunctionDefinition(functionName, content) {
    const funcDefRegex = new RegExp(`export\\s+const\\s+${functionName}\\s*=\\s*\\(\\s*\\)\\s*=>\\s*\\{[\\s\\S]*?return\\s+([^}]+)[\\s\\S]*?\\}`);
    const match = content.match(funcDefRegex);
    
    if (match) {
      return this.resolveReturnValue(match[1], content);
    }
    
    // 如果没找到，尝试查找简单的常量定义
    try {
      const constDefRegex = new RegExp(`export\\s+const\\s+${functionName}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`);
      const constMatch = content.match(constDefRegex);
      
      if (constMatch) {
        return constMatch[1];
      }
    } catch (e) {
      // 正则表达式错误，跳过
    }
    
    // 默认返回空字符串（单体应用模式）
    return '';
  }

  // 解析复杂的返回值表达式
  resolveComplexReturns(content) {
    // 动态发现所有export const函数，而不是硬编码函数名列表
    const exportFunctionRegex = /export\s+const\s+(\w+)\s*=\s*\(\s*\)\s*=>\s*\{/g;
    const discoveredFunctions = [];
    let match;
    
    while ((match = exportFunctionRegex.exec(content)) !== null) {
      const functionName = match[1];
      if (!this.urlConstantsCache.has(`{${functionName}()}`)) {
        discoveredFunctions.push(functionName);
      }
    }
    
    // 只处理在content中能找到实际定义的函数
    discoveredFunctions.forEach(functionName => {
      // 尝试从content中动态解析这个函数的值
      const resolvedValue = this.findFunctionDefinition(functionName, content);
      if (resolvedValue && resolvedValue !== '') {
        this.urlConstantsCache.set(`{${functionName}()}`, resolvedValue);
        this.urlConstantsCache.set(`${functionName}()`, resolvedValue);
      }
    });
    
    // 动态推导URL关系：寻找所有以_BASE_URL结尾的函数，并推导相关的子URL
    const baseUrlFunctions = Array.from(this.urlConstantsCache.keys())
      .filter(key => key.endsWith('_BASE_URL()'))
      .map(key => key.replace('()', ''));
    
    baseUrlFunctions.forEach(baseUrlFunc => {
      const baseUrlValue = this.urlConstantsCache.get(`${baseUrlFunc}()`);
      if (baseUrlValue) {
        // 动态查找所有以相同前缀开始的URL函数
        const prefix = baseUrlFunc.replace('_BASE_URL', '');
        const relatedFunctions = Array.from(this.urlConstantsCache.keys())
          .filter(key => key.startsWith(prefix) && key.includes('_URL') && key !== `${baseUrlFunc}()`)
          .map(key => key.replace(/[{}()]/g, ''));
        
        relatedFunctions.forEach(urlKey => {
          if (!this.urlConstantsCache.has(`{${urlKey}()}`)) {
            this.urlConstantsCache.set(`{${urlKey}()}`, baseUrlValue);
            this.urlConstantsCache.set(`${urlKey}()`, baseUrlValue);
          }
        });
      }
    });
  }

  // 扫描目录获取所有文件
  scanDirectory(dir, extensions = []) {
    const files = [];
    const localDir = dir.replace(/\//g, path.sep);
    
    if (!fs.existsSync(localDir)) {
      return files;
    }
    
    const items = fs.readdirSync(localDir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(localDir, item.name);
      const normalizedPath = this.normalizePath(fullPath);
      
      if (item.isDirectory() && !item.name.startsWith('.')) {
        files.push(...this.scanDirectory(normalizedPath, extensions));
      } else if (item.isFile()) {
        const ext = path.extname(item.name);
        if (extensions.length === 0 || extensions.includes(ext)) {
          files.push(normalizedPath);
        }
      }
    }
    return files;
  }

  // 解析URL表达式
  resolveUrlExpression(urlExpression, constants, fileContent) {
    try {
      let originalExpr = urlExpression;
      urlExpression = urlExpression.replace(/['\"]/g, '').trim();
      
      // 处理动态URL常量
      for (const [pattern, replacement] of this.urlConstantsCache.entries()) {
        if (urlExpression.includes(pattern)) {
          return urlExpression.replace(pattern, replacement);
        }
      }
      
      // 处理字符串拼接
      if (urlExpression.includes('+')) {
        const parts = urlExpression.split('+').map(part => part.trim());
        let result = '';
        
        for (const part of parts) {
          // 处理URL函数调用（优先级最高）
          if (this.urlConstantsCache.has(part)) {
            const replacement = this.urlConstantsCache.get(part);
            result += replacement;
          }
          // 处理路径字符串
          else if (part.startsWith('/')) {
            result += part;
          }
          // 处理带引号的字符串
          else if (part.match(/^['"].*['"]$/)) {
            const unquoted = part.slice(1, -1);
            result += unquoted;
          }
          // 处理本地常量（从传入的constants参数中查找）
          else if (constants[part]) {
            const replacement = constants[part];
            result += replacement;
          }
          // 在文件内容中查找常量定义
          else {
            try {
              const constPattern = new RegExp(`(?:const|let|var)\\s+${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`);
              const match = fileContent.match(constPattern);
              if (match) {
                result += match[1];
              } else {
                result += `{${part}}`;
              }
            } catch (e) {
              result += `{${part}}`;
            }
          }
        }
        return result;
      }
      
      if (constants[urlExpression]) {
        return constants[urlExpression];
      }
      
      if (urlExpression.startsWith('/')) {
        return urlExpression;
      }
      
      return urlExpression;
    } catch (error) {
      return urlExpression;
    }
  }

  // 解析API文件
  parseApiFile(filePath) {
    try {
      const localPath = filePath.replace(/\//g, path.sep);
      const content = fs.readFileSync(localPath, 'utf8');
      const apis = {};
      
      // 提取常量定义
      const constants = {};
      const constMatches = content.match(/(?:const|let|var)\s+(\w+)\s*=\s*['"`]([^'"`]+)['"`]/g) || [];
      constMatches.forEach(match => {
        const constMatch = match.match(/(?:const|let|var)\s+(\w+)\s*=\s*['"`]([^'"`]+)['"`]/);
        if (constMatch) {
          constants[constMatch[1]] = constMatch[2];
        }
      });

      // 提取export function
      const functionRegex = /export\s+function\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]*?return\s+request\s*\(\s*\{[\s\S]*?url:\s*([^,\}]+)[\s\S]*?\}\s*\)/g;
      let match;
      
      while ((match = functionRegex.exec(content)) !== null) {
        const functionName = match[1];
        const urlExpression = match[2];
        
        if (!functionName || !urlExpression) continue;
        
        const finalUrl = this.resolveUrlExpression(urlExpression.trim(), constants, content);
        
        // 提取注释作为说明
        const beforeFunction = content.substring(Math.max(0, match.index - 300), match.index);
        const commentMatch = beforeFunction.match(/\/\*\*[\s\S]*?\*\/\s*$/) || 
                             beforeFunction.match(/\/\*[\s\S]*?\*\/\s*$/) || 
                             beforeFunction.match(/\/\/[^\n]*$/);
        
        let description = functionName;
        if (commentMatch) {
          const comment = commentMatch[0]
            .replace(/\/\*\*?|\*\/|\*|\/\//g, '')
            .replace(/^\s+|\s+$/gm, '')
            .split('\n')
            .filter(line => line.trim())
            .map(line => line.replace(/^[@\\]\w+\s*/, ''))
            .join('，')
            .slice(0, 200);
          
          if (comment.trim()) {
            description = comment;
          }
        }

        apis[functionName] = {
          url: finalUrl,
          description: description
        };
      }
      
      return apis;
    } catch (error) {
      console.error(`错误: 解析API文件失败: ${filePath} - ${error.message}`);
      return {};
    }
  }

  // 预加载所有API文件
  preloadApiFiles() {
    let srcRootPath = this.findSrcRootPath();
    const apiDirPath = srcRootPath + '/api';
    
    const localApiDir = apiDirPath.replace(/\//g, path.sep);
    if (!fs.existsSync(localApiDir)) {
      console.warn(`警告: API目录不存在: ${apiDirPath}`);
      return;
    }
    
    const apiFiles = this.scanDirectory(apiDirPath, ['.js']);
    
    apiFiles.forEach(file => {
      const apis = this.parseApiFile(file);
      
      // 计算相对路径（使用规范化路径）
      const relativePath = file.replace(srcRootPath + '/', '');
      
      Object.keys(apis).forEach(funcName => {
        const cacheKey = `${funcName}@${relativePath}`;
        this.apiCache.set(cacheKey, {
          ...apis[funcName],
          filePath: relativePath,
          functionName: funcName
        });
      });
    });
  }

  // 解析Vue文件的完整信息
  parseVueFileComplete(filePath) {
    try {
      const localPath = filePath.replace(/\//g, path.sep);
      const content = fs.readFileSync(localPath, 'utf8');
      
      const result = {
        apiImports: [],
        componentImports: [],
        hasApiCalls: false
      };
      
      // 解析API导入
      const apiImportRegex = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"`](@\/api[^'"`]+)['"`]/g;
      let match;
      
      while ((match = apiImportRegex.exec(content)) !== null) {
        const functions = match[1].split(',').map(f => f.trim().replace(/\s+as\s+\w+/, ''));
        const importPath = match[2];
        
        functions.forEach(funcName => {
          let expectedFilePath = importPath.replace('@/', '') + '.js';
          expectedFilePath = this.normalizePath(expectedFilePath);
          const cacheKey = `${funcName}@${expectedFilePath}`;
          
          if (this.apiCache.has(cacheKey)) {
            const apiInfo = this.apiCache.get(cacheKey);
            result.apiImports.push({
              functionName: funcName,
              importPath,
              ...apiInfo
            });
            result.hasApiCalls = true;
          }
        });
      }
      
      // 解析Vue组件导入
      const componentImportRegex = /import\s+(\w+)\s+from\s*['"`](\.[^'"`]+)['"`]/g;
      while ((match = componentImportRegex.exec(content)) !== null) {
        const componentName = match[1];
        const relativeImportPath = match[2];
        
        // 构建子组件的完整路径（先用绝对路径计算）
        const fileDir = path.dirname(filePath);
        let childComponentPath = path.resolve(fileDir, relativeImportPath);
        
        if (!childComponentPath.endsWith('.vue')) {
          childComponentPath += '.vue';
        }
        
        childComponentPath = this.normalizePath(childComponentPath);
        
        result.componentImports.push({
          componentName,
          componentPath: childComponentPath,
          relativePath: relativeImportPath
        });
      }
      
      return result;
    } catch (error) {
      console.error(`错误: 解析Vue文件失败: ${filePath} - ${error.message}`);
      return { apiImports: [], componentImports: [], hasApiCalls: false };
    }
  }

  // 分析组件层级和构建组件关系图
  analyzeComponentLevel(filePath, actualRootPath = null) {
    let srcRootPath = this.findSrcRootPath();
    const viewsRootPath = actualRootPath || (srcRootPath + '/views');
    
    // 规范化路径，确保一致的格式
    const normalizedFilePath = this.normalizePath(filePath);
    const normalizedViewsRootPath = this.normalizePath(viewsRootPath).replace(/^\.\//, '');
    
    // 计算相对路径
    let relativePath;
    if (normalizedFilePath.includes(normalizedViewsRootPath)) {
      relativePath = normalizedFilePath.replace(normalizedViewsRootPath + '/', '');
    } else {
      // 如果没有找到匹配，直接使用文件名
      relativePath = normalizedFilePath.split('/').pop();
    }
    
    const pathParts = relativePath.split('/');
    const fileName = pathParts.pop(); // 移除文件名
    
    // 基于文件系统路径的级别（用于排序，但不用于显示）
    const fileSystemLevel = pathParts.length;
    
    // 组件类型将在构建关系图后重新计算（基于Vue导入关系）
    let componentType = `${fileSystemLevel + 1}级组件`; // 临时值
    
    return { componentType, level: fileSystemLevel, pathParts, fileName, relativePath: relativePath + '/' + fileName };
  }

  // 构建完整的组件关系图
  buildComponentGraph() {
    const componentGraph = new Map(); // 存储组件信息
    const importRelations = new Map(); // 存储导入关系
    
    // 确定views目录路径
    let viewsPath;
    let srcRootPath = this.findSrcRootPath();
    
    if (this.srcPath.includes('views')) {
      viewsPath = this.normalizePath(this.srcPath);
    } else {
      viewsPath = srcRootPath + '/views';
    }
    
    // 修复：使用实际扫描的路径作为根路径来计算相对路径
    const actualRootPath = viewsPath;
    const vueFiles = this.scanDirectory(viewsPath, ['.vue']);
    
    // 第一步：分析所有组件的基本信息和导入关系
    vueFiles.forEach(filePath => {
      const relativePath = filePath.replace(actualRootPath + '/', '');
      const { componentType, level, pathParts, fileName } = this.analyzeComponentLevel(filePath, actualRootPath);
      const fileInfo = this.parseVueFileComplete(filePath);
      
      componentGraph.set(relativePath, {
        filePath: relativePath,
        fullPath: filePath,
        componentType,
        level,
        pathParts,
        fileName,
        fileInfo,
        children: new Set(),
        parents: new Set()
      });
      
      // 记录组件导入关系
      fileInfo.componentImports.forEach(comp => {
        // 将绝对路径转换为相对路径，使其与组件图的键匹配
        // comp.componentPath是绝对路径，需要转换为相对于actualRootPath的路径
        let childPath = comp.componentPath;
        
        // 获取actualRootPath的绝对路径版本进行比较
        // 修复：如果actualRootPath已经是绝对路径，则不需要再次resolve
        const normalizedActualRootPath = this.normalizePath(
          path.isAbsolute(actualRootPath) ? actualRootPath : path.resolve(actualRootPath)
        );
        
        // 找到actualRootPath在绝对路径中的位置，然后取之后的部分
        if (childPath.includes(normalizedActualRootPath)) {
          const relativePart = childPath.substring(normalizedActualRootPath.length + 1);
          // 直接使用相对部分作为childPath，而不是重新拼接
          childPath = relativePart;
        }
        
        // 规范化路径（去掉Windows路径的问题）
        childPath = this.normalizePath(childPath);
        
        if (!importRelations.has(relativePath)) {
          importRelations.set(relativePath, new Set());
        }
        importRelations.get(relativePath).add(childPath);
      });
    });
    
    // 第二步：建立父子关系
    for (const [parentPath, childPaths] of importRelations.entries()) {
      const parentComponent = componentGraph.get(parentPath);
      if (parentComponent) {
        childPaths.forEach(childPath => {
          const childComponent = componentGraph.get(childPath);
          if (childComponent) {
            parentComponent.children.add(childPath);
            childComponent.parents.add(parentPath);
          }
        });
      }
    }
    
    // 第三步：基于Vue组件导入关系重新计算组件类型和级别
    for (const [path, component] of componentGraph.entries()) {
      if (component.parents.size === 0) {
        // 没有父组件 = 根组件
        component.componentType = '根组件';
        component.vueLevel = 0;
      } else {
        // 有父组件，计算基于导入关系的层级
        component.vueLevel = this.calculateVueComponentLevel(component, componentGraph, new Set());
        component.componentType = component.vueLevel === 0 ? '根组件' : `${component.vueLevel + 1}级组件`;
      }
    }
    
    return componentGraph;
  }

  // 递归计算Vue组件的导入层级
  calculateVueComponentLevel(component, componentGraph, visited) {
    if (visited.has(component.filePath)) {
      // 避免循环引用
      return 0;
    }
    
    visited.add(component.filePath);
    
    if (component.parents.size === 0) {
      return 0; // 根组件
    }
    
    // 找到所有父组件中最深的层级
    let maxParentLevel = -1;
    for (const parentPath of component.parents) {
      const parentComponent = componentGraph.get(parentPath);
      if (parentComponent) {
        const parentLevel = this.calculateVueComponentLevel(parentComponent, componentGraph, new Set(visited));
        maxParentLevel = Math.max(maxParentLevel, parentLevel);
      }
    }
    
    return maxParentLevel + 1;
  }

  // 按组件级别排序组件
  breadthFirstSort(componentGraph) {
    const result = [];
    
    // 按Vue组件级别分组
    const levelGroups = new Map();
    
    for (const [path, component] of componentGraph.entries()) {
      const vueLevel = component.vueLevel !== undefined ? component.vueLevel : component.level;
      if (!levelGroups.has(vueLevel)) {
        levelGroups.set(vueLevel, []);
      }
      levelGroups.get(vueLevel).push(component);
    }
    
    // 获取所有级别并排序
    const levels = Array.from(levelGroups.keys()).sort((a, b) => a - b);
    
    // 按级别顺序添加组件
    levels.forEach(level => {
      const components = levelGroups.get(level);
      // 在同一级别内按路径排序
      components.sort((a, b) => a.filePath.localeCompare(b.filePath));
      result.push(...components);
    });
    
    return result;
  }

  // 主分析方法
  analyze() {
    this.preloadUrlConstants();
    this.preloadApiFiles();
    
    // 构建组件关系图
    const componentGraph = this.buildComponentGraph();
    
    // 广度优先排序
    const sortedComponents = this.breadthFirstSort(componentGraph);
    
    this.totalFiles = sortedComponents.length;
    
    // 处理每个组件
    sortedComponents.forEach(component => {
      const parentComponents = Array.from(component.parents);
      const parentComponent = parentComponents.length > 0 ? parentComponents[0] : '';
      
      // 如果组件有API调用，记录每个API调用
      if (component.fileInfo.hasApiCalls) {
        component.fileInfo.apiImports.forEach(apiInfo => {
          this.results.push({
            filePath: component.filePath,
            componentType: component.componentType,
            parentComponent: parentComponent,
            apiFunction: apiInfo.functionName,
            url: apiInfo.url,
            description: apiInfo.description,
            fromChildComponent: '',
            childComponentPath: '',
            componentImports: component.fileInfo.componentImports.map(c => c.componentName).join(', '),
            hasApiCalls: true
          });
        });
      } else {
        // 如果组件没有API调用，仍然记录组件信息
        this.results.push({
          filePath: component.filePath,
          componentType: component.componentType,
          parentComponent: parentComponent,
          apiFunction: '',
          url: '',
          description: '',
          fromChildComponent: '',
          childComponentPath: '',
          componentImports: component.fileInfo.componentImports.map(c => c.componentName).join(', '),
          hasApiCalls: false
        });
      }
      
      this.processedFiles++;
    });
  }

  // 生成CSV报告
  generateCSV(outputPath) {
    if (!outputPath) {
      const projectName = path.basename(this.srcPath) || 'project';
      outputPath = `./${projectName}_api_extract_result.csv`;
    }
    
    const csvHeader = '文件路径,组件类型,父组件,导入的API函数,URL,说明,来自子组件,子组件路径,导入的组件,是否有API调用\n';
    
    const csvRows = this.results.map(row => {
      let processedUrl = row.url;
      
      // 首先处理URL函数常量
      for (const [pattern, replacement] of this.urlConstantsCache.entries()) {
        processedUrl = processedUrl.replace(pattern, replacement);
      }
      
      // 然后处理剩余的本地常量
      const constantPattern = /\b([A-Z_][A-Z0-9_]*)\b/g;
      let match;
      while ((match = constantPattern.exec(processedUrl)) !== null) {
        const constantName = match[1];
        if (!this.urlConstantsCache.has(constantName) && !this.urlConstantsCache.has(`${constantName}()`)) {
          for (const [cacheKey, apiInfo] of this.apiCache.entries()) {
            if (apiInfo.filePath) {
              let srcRootPath = this.findSrcRootPath();
              const apiFilePath = srcRootPath + '/' + apiInfo.filePath;
              const localApiFilePath = apiFilePath.replace(/\//g, path.sep);
              
              try {
                const apiContent = fs.readFileSync(localApiFilePath, 'utf8');
                const constRegex = new RegExp(`(?:const|let|var)\\s+${constantName}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`);
                const constMatch = apiContent.match(constRegex);
                if (constMatch) {
                  processedUrl = processedUrl.replace(new RegExp(`\\b${constantName}\\b`, 'g'), constMatch[1]);
                  break;
                }
              } catch (e) {
                // 忽略文件读取错误
              }
            }
          }
        }
      }
      
      // 处理剩余的拼接符号和空格
      processedUrl = processedUrl.replace(/\s*\+\s*/g, '').replace(/\s+/g, ' ').trim();
      
      return `"${row.filePath}","${row.componentType}","${row.parentComponent}","${row.apiFunction}","${processedUrl}","${row.description}","${row.fromChildComponent}","${row.childComponentPath}","${row.componentImports}","${row.hasApiCalls ? '是' : '否'}"`;
    });
    
    const fullContent = csvHeader + csvRows.join('\n');
    fs.writeFileSync(outputPath, fullContent, 'utf8');
    
    console.log(`CSV报告已生成: ${outputPath}`);
  }

  // 运行程序
  run() {
    try {
      this.analyze();
      this.generateCSV();
      
      console.log('\n=== 分析汇总 ===');
      console.log(`处理的Vue文件数: ${this.processedFiles}`);
      console.log(`发现的API调用关系: ${this.results.length}`);
      console.log(`缓存的API函数: ${this.apiCache.size}`);
      console.log(`解析的URL常量: ${this.urlConstantsCache.size}`);
      
      // 显示最常用的API统计信息
      const urlStats = {};
      this.results.forEach(result => {
        urlStats[result.url] = (urlStats[result.url] || 0) + 1;
      });
      
      const topApis = Object.entries(urlStats)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
      
      if (topApis.length > 0) {
        console.log(`\n最常用的API (前${topApis.length}个):`);
        topApis.forEach(([url, count]) => {
          console.log(`  ${url}: ${count}次调用`);
        });
      }
        
    } catch (error) {
      console.error('错误: 分析过程中发生错误:', error);
    }
  }
}

// 主程序入口
function main() {
  const args = process.argv.slice(2);
  const srcPath = args[0] || './src';
  
  if (!fs.existsSync(srcPath)) {
    console.error(`错误: 源代码目录不存在: ${srcPath}`);
    console.log('使用方法: node universal-vue-api-analyzer.js [src目录路径]');
    process.exit(1);
  }
  
  console.log(`分析目录: ${path.resolve(srcPath)}`);
  
  const analyzer = new UniversalVueApiAnalyzer(srcPath);
  analyzer.run();
}

if (require.main === module) {
  console.log("##########", path.sep, "##########")
  main();
}

module.exports = UniversalVueApiAnalyzer;