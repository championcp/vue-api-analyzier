const fs = require('fs');
const path = require('path');

class EnhancedMobileRouteApiAnalyzer {
  constructor(srcPath) {
    this.srcPath = srcPath;
    this.apiCache = new Map();
    this.urlConstantsCache = new Map();
    this.routeMap = new Map(); // 完整路由表：name -> route info
    this.componentRouteMap = new Map(); // 组件到路由的映射：component -> route name
    this.parentChildRelations = new Map(); // 父子关系：child -> parent
    this.results = [];
    this.processedRoutes = 0;
    this.totalRoutes = 0;
  }

  // 跨平台路径规范化
  normalizePath(inputPath) {
    let normalized = inputPath.replace(/\\/g, '/');
    normalized = normalized.replace(/\/+/g, '/');
    if (/^[A-Za-z]:/.test(inputPath)) {
      return normalized;
    }
    return normalized;
  }

  // 查找项目的src根目录
  findSrcRootPath() {
    let currentPath = this.normalizePath(path.resolve(this.srcPath));
    
    if (currentPath.endsWith('/src')) {
      return currentPath;
    }
    
    const pathParts = currentPath.split('/');
    
    for (let i = pathParts.length; i > 0; i--) {
      const testPath = pathParts.slice(0, i).join('/');
      const potentialSrcPath = testPath + '/src';
      
      const localPath = potentialSrcPath.replace(/\//g, path.sep);
      if (fs.existsSync(localPath)) {
        return potentialSrcPath;
      }
    }
    
    return this.normalizePath(path.join(this.srcPath, 'src'));
  }

  // 预加载URL常量映射
  preloadUrlConstants() {
    let srcRootPath = this.findSrcRootPath();
    
    const baseUrlFiles = [
      srcRootPath + '/api/baseUrl.js',
      srcRootPath + '/api/qz-baseUrl.js',
      srcRootPath + '/utils/baseUrl.js',
      srcRootPath + '/config/baseUrl.js',
      srcRootPath + '/constants/baseUrl.js',
      srcRootPath + '/common/baseUrl.js'
    ];
    
    for (const file of baseUrlFiles) {
      const localPath = file.replace(/\//g, path.sep);
      if (fs.existsSync(localPath)) {
        this.parseBaseUrlFile(localPath);
      }
    }
  }

  // 解析baseUrl.js文件获取URL常量映射
  parseBaseUrlFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // 解析export函数
      const exportFunctionRegex = /export\s+const\s+(\w+)\s*=\s*\(\s*\)\s*=>\s*\{[\s\S]*?return\s+([^}]+)[\s\S]*?\}/g;
      let match;
      
      while ((match = exportFunctionRegex.exec(content)) !== null) {
        const functionName = match[1];
        let returnValue = match[2].trim();
        
        const resolvedValue = this.resolveReturnValue(returnValue, content);
        
        this.urlConstantsCache.set(`{${functionName}()}`, resolvedValue);
        this.urlConstantsCache.set(`${functionName}()`, resolvedValue);
      }
      
      // 解析简单的export const
      const exportConstRegex = /export\s+const\s+(\w+)\s*=\s*['"`]([^'"`]+)['"`]/g;
      while ((match = exportConstRegex.exec(content)) !== null) {
        const constName = match[1];
        const constValue = match[2];
        this.urlConstantsCache.set(`{${constName}}`, constValue);
        this.urlConstantsCache.set(constName, constValue);
      }
      
      this.resolveComplexReturns(content);
      
    } catch (error) {
      console.error(`错误: 解析baseUrl.js文件失败: ${error.message}`);
    }
  }

  // 解析return值中的表达式
  resolveReturnValue(returnValue, content) {
    returnValue = returnValue.replace(/;|\s+/g, '');
    
    const ternaryMatch = returnValue.match(/\w+\(\)\s*\?\s*['"`]([^'"`]*)['"`]\s*:\s*['"`]([^'"`]+)['"`]/);
    if (ternaryMatch) {
      return ternaryMatch[1] || ternaryMatch[2];
    }
    
    const functionCallMatch = returnValue.match(/(\w+)\(\)/);
    if (functionCallMatch) {
      const funcName = functionCallMatch[1];
      return this.findFunctionDefinition(funcName, content);
    }
    
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
    
    try {
      const constDefRegex = new RegExp(`export\\s+const\\s+${functionName}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`);
      const constMatch = content.match(constDefRegex);
      
      if (constMatch) {
        return constMatch[1];
      }
    } catch (e) {
      // 正则表达式错误，跳过
    }
    
    return '';
  }

  // 解析复杂的返回值表达式
  resolveComplexReturns(content) {
    const exportFunctionRegex = /export\s+const\s+(\w+)\s*=\s*\(\s*\)\s*=>\s*\{/g;
    const discoveredFunctions = [];
    let match;
    
    while ((match = exportFunctionRegex.exec(content)) !== null) {
      const functionName = match[1];
      if (!this.urlConstantsCache.has(`{${functionName}()}`)) {
        discoveredFunctions.push(functionName);
      }
    }
    
    discoveredFunctions.forEach(functionName => {
      const resolvedValue = this.findFunctionDefinition(functionName, content);
      if (resolvedValue && resolvedValue !== '') {
        this.urlConstantsCache.set(`{${functionName}()}`, resolvedValue);
        this.urlConstantsCache.set(`${functionName}()`, resolvedValue);
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

  // 解析完整的路由依赖关系（根据用户分析）
  buildCompleteRouteMap() {
    let srcRootPath = this.findSrcRootPath();
    
    // 按照依赖关系解析：index.js -> routes.js -> qz-routes.js
    const routerFiles = [
      srcRootPath + '/router/qz-routes.js',  // 最底层
      srcRootPath + '/router/routes.js',     // 中间层
      srcRootPath + '/router/index.js'       // 顶层
    ];
    
    console.log('开始构建完整路由表...');
    
    routerFiles.forEach(file => {
      const localPath = file.replace(/\//g, path.sep);
      if (fs.existsSync(localPath)) {
        console.log(`解析路由文件: ${file}`);
        this.parseRouteFileEnhanced(file);
      }
    });
    
    console.log(`构建完成，共${this.routeMap.size}个路由`);
  }

  // 增强的路由文件解析
  parseRouteFileEnhanced(filePath) {
    try {
      const localPath = filePath.replace(/\//g, path.sep);
      const content = fs.readFileSync(localPath, 'utf8');
      
      // 解析所有路由对象
      this.extractAllRoutes(content, filePath);
      
    } catch (error) {
      console.error(`错误: 解析路由文件失败: ${filePath} - ${error.message}`);
    }
  }

  // 提取所有路由对象
  extractAllRoutes(content, sourceFile) {
    // 首先查找所有const数组定义
    const arrayDefRegex = /const\s+(\w+)\s*=\s*\[([\s\S]*?)\]/g;
    let arrayMatch;
    
    while ((arrayMatch = arrayDefRegex.exec(content)) !== null) {
      const arrayName = arrayMatch[1];
      const arrayContent = arrayMatch[2];
      
      // 只处理包含路由对象的数组
      if (arrayContent.includes('path:') || arrayContent.includes('component:')) {
        console.log(`  处理路由数组: ${arrayName}`);
        this.extractRoutesFromArrayContent(arrayContent, sourceFile, arrayName);
      }
    }
    
    // 也处理直接的路由对象（不在数组中的）
    const singleRouteRegex = /\{\s*path:\s*['"`]([^'"`]+)['"`][^{}]*?(?:name:\s*['"`]([^'"`]*?)['"`])?[^{}]*?(?:component:\s*([^,\}\n]+))?[^{}]*?\}/gs;
    let match;
    
    while ((match = singleRouteRegex.exec(content)) !== null) {
      const routeString = match[0];
      const path = match[1];
      const name = match[2] || '';
      const componentString = match[3] ? match[3].trim() : '';
      
      // 解析 _import 参数得到组件路径
      const componentPath = this.parseImportPath(componentString);
      
      const routeInfo = {
        path: path,
        name: name,
        componentPath: componentPath,
        componentString: componentString,
        source: sourceFile,
        level: this.calculateRouteLevel(path)
      };
      
      // 存储到路由表
      if (name) {
        this.routeMap.set(name, routeInfo);
        console.log(`  路由: ${name} (${path}) -> ${componentPath}`);
      }
      
      // 建立组件到路由名称的映射
      if (componentPath && name) {
        this.componentRouteMap.set(componentPath, name);
      }
      
      // 处理嵌套的children路由
      this.extractChildrenRoutes(routeString, routeInfo, sourceFile);
    }
  }

  // 从数组内容中提取路由
  extractRoutesFromArrayContent(arrayContent, sourceFile, arrayName) {
    // 匹配路由对象，支持嵌套的children
    const routeObjectRegex = /\{\s*path:\s*['"`]([^'"`]+)['"`][^{}]*?(?:\{[^{}]*\}[^{}]*?)*\}/gs;
    let match;
    
    while ((match = routeObjectRegex.exec(arrayContent)) !== null) {
      const routeString = match[0];
      const path = match[1];
      
      // 提取name
      const nameMatch = routeString.match(/name:\s*['"`]([^'"`]*?)['"`]/);
      const name = nameMatch ? nameMatch[1] : '';
      
      // 提取component
      const componentMatch = routeString.match(/component:\s*([^,\}\n]+)/);
      const componentString = componentMatch ? componentMatch[1].trim() : '';
      
      // 解析 _import 参数得到组件路径
      const componentPath = this.parseImportPath(componentString);
      
      const routeInfo = {
        path: path,
        name: name,
        componentPath: componentPath,
        componentString: componentString,
        source: sourceFile,
        arrayName: arrayName,
        level: this.calculateRouteLevel(path)
      };
      
      // 存储到路由表
      if (name) {
        this.routeMap.set(name, routeInfo);
        console.log(`    路由: ${name} (${path}) -> ${componentPath}`);
      }
      
      // 建立组件到路由名称的映射
      if (componentPath && name) {
        this.componentRouteMap.set(componentPath, name);
      }
      
      // 处理嵌套的children路由
      this.extractChildrenRoutes(routeString, routeInfo, sourceFile);
    }
  }

  // 解析 _import 参数得到组件路径
  parseImportPath(componentString) {
    if (!componentString) return '';
    
    // 匹配 _import('/modules/kqdk/student/current-task-progress') 或 _import(`/system/dashboard/${global.STYLE}index.vue`)
    const importMatch = componentString.match(/_import\s*\(\s*['"`]([^'"`]+)['"`]/) || 
                       componentString.match(/_import\s*\(\s*`([^`]+)`/);
    if (importMatch) {
      let importPath = importMatch[1];
      
      // 处理模板字符串中的变量（如 ${global.STYLE}），简单替换为空
      importPath = importPath.replace(/\$\{[^}]+\}/g, '');
      
      // 处理以 /modules 开头的路径
      if (importPath.startsWith('/modules')) {
        // 转换为 /views 路径
        importPath = '/views' + importPath;
      } else if (!importPath.startsWith('/views')) {
        // 确保以/views开头
        importPath = '/views' + (importPath.startsWith('/') ? '' : '/') + importPath;
      }
      
      // 确保以.vue结尾，但首先检查是否存在index.vue目录结构
      if (!importPath.endsWith('.vue')) {
        // 检查是否存在对应的index.vue文件
        const srcRootPath = this.findSrcRootPath();
        const indexPath = srcRootPath + importPath + '/index.vue';
        const localIndexPath = indexPath.replace(/\//g, path.sep);
        
        if (fs.existsSync(localIndexPath)) {
          importPath += '/index.vue';
        } else {
          importPath += '.vue';
        }
      }
      return importPath;
    }
    
    // 处理动态导入: () => import('./views/User.vue')
    const dynamicImportMatch = componentString.match(/import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
    if (dynamicImportMatch) {
      let importPath = dynamicImportMatch[1];
      if (importPath.startsWith('./')) {
        importPath = importPath.substring(2);
      }
      if (!importPath.startsWith('/')) {
        importPath = '/' + importPath;
      }
      return importPath;
    }
    
    return '';
  }

  // 提取子路由
  extractChildrenRoutes(parentRouteString, parentRoute, sourceFile) {
    const childrenMatch = parentRouteString.match(/children:\s*\[([\s\S]*?)\]/);
    if (childrenMatch) {
      const childrenContent = childrenMatch[1];
      const childRouteRegex = /\{\s*path:\s*['"`]([^'"`]+)['"`][^}]*?(?:name:\s*['"`]([^'"`]*?)['"`])?[^}]*?(?:component:\s*([^,\}]+))?[^}]*?\}/g;
      let childMatch;
      
      while ((childMatch = childRouteRegex.exec(childrenContent)) !== null) {
        const childPath = childMatch[1];
        const childName = childMatch[2] || '';
        const componentString = childMatch[3] || '';
        
        const fullPath = this.buildFullPath(parentRoute.path, childPath);
        const componentPath = this.parseImportPath(componentString);
        
        const childRoute = {
          path: fullPath,
          name: childName,
          componentPath: componentPath,
          componentString: componentString,
          parentRoute: parentRoute.name,
          source: sourceFile,
          level: parentRoute.level + 1
        };
        
        if (childName) {
          this.routeMap.set(childName, childRoute);
          console.log(`    子路由: ${childName} (${fullPath}) -> ${componentPath}`);
        }
        
        if (componentPath && childName) {
          this.componentRouteMap.set(componentPath, childName);
        }
      }
    }
  }

  // 构建完整路径
  buildFullPath(parentPath, childPath) {
    if (childPath.startsWith('/')) {
      return childPath;
    }
    
    if (parentPath === '/') {
      return '/' + childPath;
    }
    
    return parentPath + '/' + childPath;
  }

  // 计算路由层级（基于路由配置结构）
  calculateRouteLevel(path, parentRoute = null) {
    if (path === '/') return 1;
    
    // 如果有父路由，层级为父路由层级+1
    if (parentRoute) {
      return parentRoute.level + 1;
    }
    
    // 根据路径深度计算基础层级
    const parts = path.split('/').filter(part => part !== '');
    return Math.max(1, parts.length);
  }

  // 分析Vue组件中的this.$router.push()调用
  analyzeRouterPushCalls(componentPath) {
    const childRoutes = [];
    
    try {
      let srcRootPath = this.findSrcRootPath();
      let fullPath = srcRootPath + componentPath;
      
      const localPath = fullPath.replace(/\//g, path.sep);
      if (!fs.existsSync(localPath)) {
        return childRoutes;
      }
      
      const content = fs.readFileSync(localPath, 'utf8');
      
      // 匹配 this.$router.push() 调用
      const routerPushRegex = /this\.\$router\.push\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|this\.\$router\.push\s*\(\s*\{\s*name:\s*['"`]([^'"`]+)['"`]/g;
      let match;
      
      while ((match = routerPushRegex.exec(content)) !== null) {
        const routePath = match[1]; // 路径形式
        const routeName = match[2]; // 名称形式
        
        if (routePath) {
          // 通过路径查找对应的路由名称
          for (const [name, route] of this.routeMap.entries()) {
            if (route.path === routePath) {
              childRoutes.push(name);
              break;
            }
          }
        } else if (routeName) {
          // 直接使用路由名称
          if (this.routeMap.has(routeName)) {
            childRoutes.push(routeName);
          }
        }
      }
      
    } catch (error) {
      // 文件不存在或读取失败，忽略
    }
    
    return childRoutes;
  }

  // 构建父子关系（基于路由配置结构）
  buildParentChildRelations() {
    console.log('开始分析父子关系...');
    
    // 首先基于路由配置中的children属性建立关系
    for (const [routeName, routeInfo] of this.routeMap.entries()) {
      if (routeInfo.parentRoute) {
        this.parentChildRelations.set(routeName, routeInfo.parentRoute);
        console.log(`  配置父子关系: ${routeInfo.parentRoute} -> ${routeName}`);
      }
    }
    
    // 然后基于路径结构推断关系
    const routesByPath = new Map();
    for (const [routeName, routeInfo] of this.routeMap.entries()) {
      if (!routesByPath.has(routeInfo.path)) {
        routesByPath.set(routeInfo.path, []);
      }
      routesByPath.get(routeInfo.path).push(routeName);
    }
    
    // 根据路径层级建立父子关系
    for (const [routeName, routeInfo] of this.routeMap.entries()) {
      if (this.parentChildRelations.has(routeName)) continue; // 已有关系，跳过
      
      const pathParts = routeInfo.path.split('/').filter(part => part !== '');
      if (pathParts.length > 1) {
        // 查找可能的父路径
        for (let i = pathParts.length - 1; i > 0; i--) {
          const parentPath = '/' + pathParts.slice(0, i).join('/');
          
          // 查找匹配该路径的路由
          for (const [parentName, parentInfo] of this.routeMap.entries()) {
            if (parentInfo.path === parentPath && parentName !== routeName) {
              this.parentChildRelations.set(routeName, parentName);
              console.log(`  推断父子关系: ${parentName} -> ${routeName}`);
              break;
            }
          }
          
          if (this.parentChildRelations.has(routeName)) break;
        }
      }
    }
    
    // 最后，分析组件中的 router.push 调用作为补充
    for (const [routeName, routeInfo] of this.routeMap.entries()) {
      if (!routeInfo.componentPath) continue;
      
      // 分析该组件中的 router.push 调用
      const childRoutes = this.analyzeRouterPushCalls(routeInfo.componentPath);
      
      childRoutes.forEach(childRouteName => {
        if (!this.parentChildRelations.has(childRouteName)) {
          this.parentChildRelations.set(childRouteName, routeName);
          console.log(`  代码父子关系: ${routeName} -> ${childRouteName}`);
        }
      });
    }
    
    console.log(`分析完成，发现${this.parentChildRelations.size}个父子关系`);
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

      // 提取export function - 改进正则表达式以正确匹配完整URL表达式
      // 修复：分步解析，先匹配函数，再精确提取url字段
      const functionRegex = /export\s+function\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]*?return\s+request\s*\(\s*(\{[\s\S]*?\})\s*\)/g;
      let match;
      
      while ((match = functionRegex.exec(content)) !== null) {
        const functionName = match[1];
        const requestObject = match[2];
        
        if (!functionName || !requestObject) continue;
        
        // 从请求对象中提取URL字段 - 改进匹配，支持复杂URL表达式
        const urlMatch = requestObject.match(/url:\s*([^,\}]*?)(?=\s*[,\}\n])/);
        if (!urlMatch) continue;
        
        let urlExpression = urlMatch[1].trim();
        
        // 如果URL表达式包含模板字符串但没有完整闭合，尝试匹配更完整的表达式
        if (urlExpression.includes('`') && !urlExpression.match(/^`.*`$/)) {
          // 查找完整的模板字符串
          const fullTemplateMatch = requestObject.match(/url:\s*(`[^`]*`)/);
          if (fullTemplateMatch) {
            urlExpression = fullTemplateMatch[1];
          }
        }
        
        // 如果URL表达式包含${但没有闭合，尝试匹配更完整的表达式
        if (urlExpression.includes('${') && !urlExpression.includes('}')) {
          const fullExprMatch = requestObject.match(/url:\s*([^,\}]*\}[^,\}]*?)(?=\s*[,\}\n])/);
          if (fullExprMatch) {
            urlExpression = fullExprMatch[1];
          }
        }
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

  // 解析URL表达式 - 重新设计以处理各种复杂情况
  resolveUrlExpression(urlExpression, constants, fileContent) {
    try {
      if (!urlExpression) return 'Unknown URL';
      
      let originalExpr = urlExpression;
      let cleanUrl = urlExpression.trim();
      
      // 处理引号包围的情况
      if ((cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) ||
          (cleanUrl.startsWith("'") && cleanUrl.endsWith("'"))) {
        return cleanUrl.slice(1, -1);
      }
      
      // 处理模板字符串
      if (cleanUrl.startsWith('`') && cleanUrl.endsWith('`')) {
        cleanUrl = cleanUrl.slice(1, -1); // 移除反引号
        
        // 查找并替换${变量名}
        cleanUrl = cleanUrl.replace(/\$\{([^}]+)\}/g, (match, varName) => {
          varName = varName.trim();
          
          // 在本地常量中查找
          if (constants[varName]) {
            return constants[varName];
          }
          
          // 在文件内容中查找常量定义
          const constPattern = new RegExp(`(?:const|let|var)\\s+${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`);
          const constMatch = fileContent.match(constPattern);
          if (constMatch) {
            return constMatch[1];
          }
          
          // 处理常见的PATH变量
          if (varName === 'PATH') {
            return '/xssw/v3';
          }
          
          // 如果找不到，保持原样但移除${}
          return `{${varName}}`;
        });
        
        return cleanUrl;
      }
      
      // 处理字符串拼接 (如 YXXT_URL + '/path')
      if (cleanUrl.includes('+')) {
        const parts = cleanUrl.split('+').map(part => part.trim());
        let resolvedUrl = '';
        
        for (const part of parts) {
          if (part.startsWith('"') && part.endsWith('"')) {
            // 字符串字面量
            resolvedUrl += part.slice(1, -1);
          } else if (part.startsWith("'") && part.endsWith("'")) {
            // 字符串字面量
            resolvedUrl += part.slice(1, -1);
          } else if (part.startsWith('`') && part.endsWith('`')) {
            // 模板字符串字面量
            let templateStr = part.slice(1, -1);
            // 处理模板字符串内的变量
            templateStr = templateStr.replace(/\$\{([^}]+)\}/g, (match, varName) => {
              varName = varName.trim();
              if (constants[varName]) return constants[varName];
              // 在文件内容中查找
              const constPattern = new RegExp(`(?:const|let|var)\\s+${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`);
              const constMatch = fileContent.match(constPattern);
              if (constMatch) return constMatch[1];
              return varName; // 返回变量名而不是整个匹配
            });
            resolvedUrl += templateStr;
          } else {
            // 变量名
            if (constants[part]) {
              resolvedUrl += constants[part];
            } else {
              // 在文件内容中查找常量定义
              const constPattern = new RegExp(`(?:const|let|var)\\s+${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`);
              const constMatch = fileContent.match(constPattern);
              if (constMatch) {
                resolvedUrl += constMatch[1];
              } else {
                // 处理常见的URL常量
                if (part === 'YXXT_URL') {
                  resolvedUrl += '/yxxt/v3';
                } else if (part === 'PATH') {
                  resolvedUrl += '/xssw/v3';
                } else {
                  resolvedUrl += part; // 保持原样
                }
              }
            }
          }
        }
        
        return resolvedUrl;
      }
      
      // 处理单个变量
      if (constants[cleanUrl]) {
        return constants[cleanUrl];
      }
      
      // 在文件内容中查找常量定义
      const constPattern = new RegExp(`(?:const|let|var)\\s+${cleanUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`);
      const constMatch = fileContent.match(constPattern);
      if (constMatch) {
        return constMatch[1];
      }
      
      // 处理常见的URL常量
      if (cleanUrl === 'YXXT_URL') {
        return '/yxxt/v3';
      } else if (cleanUrl === 'PATH') {
        return '/xssw/v3';
      }
      
      // 处理动态URL常量
      for (const [pattern, replacement] of this.urlConstantsCache.entries()) {
        if (cleanUrl.includes(pattern)) {
          return cleanUrl.replace(pattern, replacement);
        }
      }
      
      // 如果是以/开头的路径，直接返回
      if (cleanUrl.startsWith('/')) {
        return cleanUrl;
      }
      
      return cleanUrl;
    } catch (error) {
      return originalExpr || urlExpression;
    }
  }

  // 预加载所有API文件
  preloadApiFiles() {
    let srcRootPath = this.findSrcRootPath();
    
    // 扫描多个可能的API目录
    const apiDirectories = [
      srcRootPath + '/api',
      srcRootPath + '/views/modules'  // 添加modules目录扫描
    ];
    
    console.log('开始预加载API文件...');
    
    apiDirectories.forEach(apiDirPath => {
      const localApiDir = apiDirPath.replace(/\//g, path.sep);
      if (!fs.existsSync(localApiDir)) {
        console.log(`跳过不存在的目录: ${apiDirPath}`);
        return;
      }
      
      console.log(`扫描API目录: ${apiDirPath}`);
      const apiFiles = this.scanDirectory(apiDirPath, ['.js']);
      
      console.log(`在 ${apiDirPath} 中找到 ${apiFiles.length} 个JS文件`);
      
      apiFiles.forEach(file => {
        // 只处理明确是API文件的文件
        if (file.includes('/api/') || file.endsWith('/api.js') || file.match(/\/api\.js$/)) {
          console.log(`解析API文件: ${file}`);
          const apis = this.parseApiFile(file);
          
          const relativePath = file.replace(srcRootPath + '/', '');
          
          Object.keys(apis).forEach(funcName => {
            const cacheKey = `${funcName}@${relativePath}`;
            this.apiCache.set(cacheKey, {
              ...apis[funcName],
              filePath: relativePath,
              functionName: funcName
            });
            console.log(`  缓存API函数: ${funcName} -> ${relativePath}`);
          });
        }
      });
    });
    
    console.log(`API预加载完成，共缓存 ${this.apiCache.size} 个函数`);
  }

  // 分析Vue组件文件中的API调用
  parseVueComponentForApi(componentPath, depth = 0, visitedComponents = new Set()) {
    try {
      // 防止无限递归和重复分析
      const normalizedPath = this.normalizePath(componentPath);
      if (visitedComponents.has(normalizedPath) || depth > 3) {
        return { apiImports: [], hasApiCalls: false, childComponents: [] };
      }
      
      visitedComponents.add(normalizedPath);
      
      let srcRootPath = this.findSrcRootPath();
      let fullPath = srcRootPath + componentPath;
      
      const localPath = fullPath.replace(/\//g, path.sep);
      
      if (!fs.existsSync(localPath)) {
        return { apiImports: [], hasApiCalls: false, childComponents: [] };
      }
      
      const content = fs.readFileSync(localPath, 'utf8');
      
      const result = {
        apiImports: [],
        hasApiCalls: false,
        childComponents: []
      };
      
      // 解析API导入 - 支持多种导入路径格式
      const apiImportRegex = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"`]([^'"`]+)['"`]/g;
      let match;
      
      while ((match = apiImportRegex.exec(content)) !== null) {
        const functions = match[1].split(',').map(f => f.trim().replace(/\s+as\s+\w+/, ''));
        const importPath = match[2];
        
        console.log(`    发现导入: functions=[${functions.join(', ')}], importPath=${importPath}`);
        
        // 只处理API相关的导入
        if (!importPath.includes('/api/') && !importPath.startsWith('@/api') && 
            !importPath.includes('../api/') && !importPath.includes('@/views/modules/')) {
          console.log(`    跳过非API导入: ${importPath}`);
          continue;
        }
        
        console.log(`    处理API导入: ${importPath}`);
        
        functions.forEach(funcName => {
          // 尝试多种可能的文件路径
          const possiblePaths = [];
          
          if (importPath.startsWith('@/')) {
            // @/api/xgxt -> api/xgxt/index.js 和 api/xgxt.js
            // @/views/modules/kqdk/api.js -> views/modules/kqdk/api.js (直接使用)
            const basePath = importPath.replace('@/', '');
            
            if (basePath.endsWith('.js')) {
              // 如果已经以.js结尾，直接使用
              possiblePaths.push(this.normalizePath(basePath));
            } else {
              // 否则尝试index.js和.js扩展名
              possiblePaths.push(this.normalizePath(basePath + '/index.js'));
              possiblePaths.push(this.normalizePath(basePath + '.js'));
            }
          } else if (importPath.startsWith('../')) {
            // 处理相对路径，例如 ../../../api/xgxt/index
            // 需要基于当前组件路径解析
            const currentDir = path.dirname(componentPath);
            const resolvedPath = path.resolve(srcRootPath + currentDir, importPath);
            const relativePath = resolvedPath.replace(srcRootPath + '/', '');
            possiblePaths.push(this.normalizePath(relativePath + '.js'));
            possiblePaths.push(this.normalizePath(relativePath + '/index.js'));
            // 如果路径已经包含 index，也尝试不带 index 的版本
            if (relativePath.endsWith('/index')) {
              const withoutIndex = relativePath.slice(0, -6); // 移除 '/index'
              possiblePaths.push(this.normalizePath(withoutIndex + '.js'));
            }
          }
          
          // 尝试每个可能的路径
          console.log(`      查找函数: ${funcName}, 尝试路径: ${possiblePaths.join(', ')}`);
          for (const expectedFilePath of possiblePaths) {
            const cacheKey = `${funcName}@${expectedFilePath}`;
            console.log(`        尝试缓存键: ${cacheKey}`);
            
            if (this.apiCache.has(cacheKey)) {
              console.log(`        找到API: ${funcName} -> ${expectedFilePath}`);
              const apiInfo = this.apiCache.get(cacheKey);
              result.apiImports.push({
                functionName: funcName,
                importPath,
                depth: depth,
                sourceComponent: componentPath,
                ...apiInfo
              });
              result.hasApiCalls = true;
              break; // 找到就停止尝试其他路径
            }
          }
        });
      }
      
      // 解析子组件导入（Vue组件）
      const childComponentImports = this.parseChildComponents(content, componentPath);
      result.childComponents = childComponentImports;
      
      // 递归分析子组件的API调用
      for (const childPath of childComponentImports) {
        const childResult = this.parseVueComponentForApi(childPath, depth + 1, new Set(visitedComponents));
        if (childResult.hasApiCalls) {
          // 将子组件的API调用添加到当前组件结果中，并标记来源
          childResult.apiImports.forEach(api => {
            result.apiImports.push({
              ...api,
              isFromChild: true,
              childSourcePath: childPath,
              parentDepth: depth
            });
          });
          result.hasApiCalls = true;
        }
      }
      
      return result;
    } catch (error) {
      console.error(`错误: 解析Vue组件文件失败: ${componentPath} - ${error.message}`);
      return { apiImports: [], hasApiCalls: false, childComponents: [] };
    }
  }

  // 解析Vue组件中导入的子组件
  parseChildComponents(content, currentComponentPath) {
    const childComponents = [];
    const srcRootPath = this.findSrcRootPath();
    const currentDir = path.dirname(currentComponentPath);
    
    // 匹配import语句导入的Vue组件
    const componentImportRegex = /import\s+(\w+)\s+from\s+['"`]([^'"`]+)['"`]/g;
    let match;
    
    while ((match = componentImportRegex.exec(content)) !== null) {
      const componentName = match[1];
      const importPath = match[2];
      
      // 跳过明显的非Vue组件导入
      if (importPath.includes('/api/') || 
          importPath.includes('/utils/') || 
          importPath.includes('/mixins/') ||
          importPath.includes('node_modules') ||
          importPath.includes('@/assets/') ||
          importPath.includes('@/styles/') ||
          (importPath.includes('.js') && !importPath.includes('/views/')) ||
          (importPath.includes('.ts') && !importPath.includes('/views/'))) {
        continue;
      }
      
      let resolvedPath;
      
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        // 相对路径解析
        try {
          // 构建当前组件的完整目录路径
          const currentFullDir = path.resolve(srcRootPath + currentDir);
          // 解析相对路径
          const absolutePath = path.resolve(currentFullDir, importPath);
          // 转换为相对于srcRoot的路径
          let relativePath = path.relative(srcRootPath, absolutePath);
          // 规范化路径分隔符
          resolvedPath = this.normalizePath('/' + relativePath);
        } catch (error) {
          console.warn(`路径解析失败: ${importPath} 从 ${currentComponentPath}`);
          continue;
        }
      } else if (importPath.startsWith('@/')) {
        // 绝对路径（使用@别名）
        resolvedPath = this.normalizePath(importPath.replace('@', ''));
      } else {
        // 其他情况，可能是相对于views的路径
        resolvedPath = this.normalizePath(`/views/${importPath}`);
      }
      
      // 确保路径以.vue结尾
      if (!resolvedPath.endsWith('.vue')) {
        resolvedPath += '.vue';
      }
      
      // 检查文件是否存在
      const fullPath = srcRootPath + resolvedPath;
      const localPath = fullPath.replace(/\//g, path.sep);
      
      if (fs.existsSync(localPath)) {
        childComponents.push(resolvedPath);
        console.log(`  找到子组件: ${componentName} -> ${resolvedPath}`);
      } else {
        // 如果第一次没找到，尝试其他可能的路径
        const alternativePaths = [];
        
        // 尝试不同的扩展名和路径组合
        if (importPath.startsWith('@/views/modules/')) {
          const basePath = importPath.replace('@/', '');
          alternativePaths.push(
            this.normalizePath(`/${basePath}.vue`),
            this.normalizePath(`/${basePath}/index.vue`)
          );
        }
        
        // 尝试备选路径
        let found = false;
        for (const altPath of alternativePaths) {
          const altFullPath = srcRootPath + altPath;
          const altLocalPath = altFullPath.replace(/\//g, path.sep);
          
          if (fs.existsSync(altLocalPath)) {
            childComponents.push(altPath);
            console.log(`  找到子组件(备选路径): ${componentName} -> ${altPath}`);
            found = true;
            break;
          }
        }
        
        if (!found) {
          console.warn(`  子组件文件不存在: ${resolvedPath} (原始: ${importPath})`);
        }
      }
    }
    
    return childComponents;
  }

  // 构建最终结果（每个API一行）
  buildFinalResults() {
    console.log('开始构建最终结果...');
    
    for (const [routeName, routeInfo] of this.routeMap.entries()) {
      if (!routeInfo.componentPath) continue;
      
      // 获取API调用信息（包括子组件）
      const apiInfo = this.parseVueComponentForApi(routeInfo.componentPath);
      
      // 获取父路由
      const parentRouteName = this.parentChildRelations.get(routeName) || routeInfo.parentRoute || '';
      
      // 收集子组件信息
      const childComponents = [];
      if (apiInfo.hasApiCalls) {
        apiInfo.apiImports.forEach(api => {
          if (api.isFromChild) {
            childComponents.push({
              name: path.basename(api.childSourcePath, '.vue'),
              path: api.childSourcePath
            });
          }
        });
      }
      
      if (apiInfo.hasApiCalls && apiInfo.apiImports.length > 0) {
        // 为每个API创建一条记录
        apiInfo.apiImports.forEach(api => {
          this.results.push({
            routeName: routeName,
            routePath: routeInfo.path,
            parentRoute: parentRouteName,
            routeLevel: routeInfo.level,
            componentPath: routeInfo.componentPath,
            apiFunction: api.functionName,
            url: api.url || '',
            description: api.description || '',
            sourceFile: routeInfo.source,
            hasApiCalls: '是',
            childComponents: childComponents.map(c => c.name).join(', '),
            childPaths: childComponents.map(c => c.path).join(', '),
            isFromChild: api.isFromChild || false,
            childSourcePath: api.childSourcePath || ''
          });
        });
      } else {
        // 没有API调用的路由创建一条记录
        this.results.push({
          routeName: routeName,
          routePath: routeInfo.path,
          parentRoute: parentRouteName,
          routeLevel: routeInfo.level,
          componentPath: routeInfo.componentPath,
          apiFunction: '',
          url: '',
          description: '',
          sourceFile: routeInfo.source,
          hasApiCalls: '否',
          childComponents: '',
          childPaths: '',
          isFromChild: false,
          childSourcePath: ''
        });
      }
    }
    
    console.log(`构建完成，生成${this.results.length}条记录`);
  }

  // 主分析方法
  analyze() {
    console.log('开始增强版移动端路由和API关系分析...');
    
    this.preloadUrlConstants();
    console.log(`已加载URL常量: ${this.urlConstantsCache.size}个`);
    
    this.preloadApiFiles();
    console.log(`已加载API函数: ${this.apiCache.size}个`);
    
    this.buildCompleteRouteMap();
    this.buildParentChildRelations();
    this.buildFinalResults();
    
    console.log('分析完成!');
  }

  // 生成CSV报告
  generateCSV(outputPath) {
    if (!outputPath) {
      const projectName = path.basename(this.srcPath) || 'mobile-project';
      outputPath = `./${projectName}_enhanced_route_api_analysis.csv`;
    }
    
    // 更新CSV格式以适应每个API一行的格式
    const csvHeader = '文件路径,组件类型,父组件,导入的API函数,URL,说明,来自子组件,子组件路径,导入的组件,是否有API调用\n';
    
    const csvRows = this.results.map(row => {
      let processedUrl = row.url || '';
      
      // 处理URL函数常量
      for (const [pattern, replacement] of this.urlConstantsCache.entries()) {
        processedUrl = processedUrl.replace(pattern, replacement);
      }
      
      // 处理剩余的本地常量
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
      
      // 映射字段到CSV格式
      const componentType = `${row.routeLevel}级路由`;
      
      // 处理来自子组件的标识
      const fromChildComponent = row.isFromChild ? 
        (row.childSourcePath ? path.basename(row.childSourcePath, '.vue') : '子组件') : '';
      const childSourcePathFormatted = row.isFromChild ? (row.childSourcePath || '') : '';
      
      // 使用路由路径作为文件路径标识，父组件也使用路由名称
      return `"${row.routePath}","${componentType}","${row.parentRoute || ''}","${row.apiFunction || ''}","${processedUrl}","${row.description || ''}","${fromChildComponent}","${childSourcePathFormatted}","${row.childComponents || ''}","${row.hasApiCalls}"`;
    });
    
    const fullContent = csvHeader + csvRows.join('\n');
    fs.writeFileSync(outputPath, fullContent, 'utf8');
    
    console.log(`\nCSV报告已生成: ${outputPath}`);
  }

  // 运行程序
  run() {
    try {
      this.analyze();
      this.generateCSV();
      
      console.log('\n=== 增强版分析汇总 ===');
      console.log(`处理的路由数: ${this.processedRoutes}`);
      console.log(`发现的API调用关系: ${this.results.filter(r => r.apiFunction).length}`);
      console.log(`缓存的API函数: ${this.apiCache.size}`);
      console.log(`解析的URL常量: ${this.urlConstantsCache.size}`);
      console.log(`缓存的路由信息: ${this.routeMap.size}`);
      console.log(`发现的父子关系: ${this.parentChildRelations.size}`);
      
      // 显示路由层级统计
      const levelStats = {};
      this.results.forEach(result => {
        const level = `${result.routeLevel}级`;
        levelStats[level] = (levelStats[level] || 0) + 1;
      });
      
      console.log('\n路由层级分布:');
      Object.entries(levelStats)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .forEach(([level, count]) => {
          console.log(`  ${level}路由: ${count}个`);
        });
      
      // 显示父子关系示例
      console.log('\n父子关系示例:');
      let count = 0;
      for (const [child, parent] of this.parentChildRelations.entries()) {
        if (count++ < 5) {
          console.log(`  ${parent} -> ${child}`);
        }
      }
      
      // 显示最常用的API统计信息
      const urlStats = {};
      this.results.filter(r => r.url).forEach(result => {
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
  
  // 显示帮助信息
  if (args.includes('-h') || args.includes('--help')) {
    console.log(`
增强版Vue移动端路由API分析器

使用方法:
  node enhanced-mobile-route-api-analyzer.js [src目录路径] [选项]

参数:
  src目录路径    Vue项目的src目录路径 (默认: ./src)

选项:
  -h, --help    显示帮助信息
  -o, --output  指定输出CSV文件路径 (默认: 自动生成)

示例:
  node enhanced-mobile-route-api-analyzer.js /path/to/vue/project/src
  node enhanced-mobile-route-api-analyzer.js ./src -o my-analysis.csv
    `);
    process.exit(0);
  }
  
  // 解析命令行参数
  const srcPath = args[0] || './src';
  const outputIndex = args.findIndex(arg => arg === '-o' || arg === '--output');
  const outputPath = outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : null;
  
  // 验证源目录
  if (!fs.existsSync(srcPath)) {
    console.error(`❌ 错误: 源代码目录不存在: ${srcPath}`);
    console.log('\n使用方法: node enhanced-mobile-route-api-analyzer.js [src目录路径]');
    console.log('使用 -h 或 --help 查看详细帮助信息');
    process.exit(1);
  }
  
  const resolvedPath = path.resolve(srcPath);
  console.log(`🔍 开始分析Vue项目: ${resolvedPath}`);
  
  try {
    const analyzer = new EnhancedMobileRouteApiAnalyzer(srcPath);
    
    // 执行分析
    console.log('📚 预加载URL常量...');
    analyzer.preloadUrlConstants();
    
    console.log('🔗 预加载API文件...');
    analyzer.preloadApiFiles();
    
    console.log('🗺️  构建完整路由表...');
    analyzer.buildCompleteRouteMap();
    
    console.log('🎯 分析所有路由...');
    analyzer.analyze();
    
    // 生成CSV报告
    const finalOutputPath = outputPath || `${path.basename(resolvedPath)}_enhanced_route_api_analysis.csv`;
    console.log(`📊 生成CSV报告: ${finalOutputPath}`);
    analyzer.generateCSV(finalOutputPath);
    
    console.log(`\n✅ 分析完成！`);
    console.log(`📁 报告文件: ${path.resolve(finalOutputPath)}`);
    console.log(`📈 路由数量: ${analyzer.routeMap.size}`);
    console.log(`📈 API记录数: ${analyzer.results.length}`);
    
  } catch (error) {
    console.error('❌ 分析过程中发生错误:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = EnhancedMobileRouteApiAnalyzer;