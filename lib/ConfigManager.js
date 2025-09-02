const fs = require('fs');
const path = require('path');

/**
 * 配置管理器类
 * 负责加载、验证和管理分析器配置
 */
class ConfigManager {
  constructor(customConfigPath = null) {
    this.config = null;
    this.configPath = customConfigPath;
    this.defaultConfigPath = path.join(__dirname, '..', 'config', 'analyzer-config.json');
    
    // 加载配置
    this.loadConfiguration();
  }

  /**
   * 加载配置文件
   * 优先级：自定义配置 > 项目配置 > 默认配置
   */
  loadConfiguration() {
    let configData = null;
    let configSource = '';

    // 1. 尝试加载自定义配置路径
    if (this.configPath && fs.existsSync(this.configPath)) {
      try {
        configData = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        configSource = this.configPath;
        console.log(`✓ 已加载自定义配置: ${this.configPath}`);
      } catch (error) {
        console.warn(`⚠️ 自定义配置文件解析失败: ${this.configPath}, 错误: ${error.message}`);
      }
    }

    // 2. 如果没有自定义配置，尝试加载项目根目录的配置
    if (!configData) {
      const projectConfigPath = path.join(process.cwd(), 'vue-api-analyzer.config.json');
      if (fs.existsSync(projectConfigPath)) {
        try {
          configData = JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'));
          configSource = projectConfigPath;
          console.log(`✓ 已加载项目配置: ${projectConfigPath}`);
        } catch (error) {
          console.warn(`⚠️ 项目配置文件解析失败: ${projectConfigPath}, 错误: ${error.message}`);
        }
      }
    }

    // 3. 加载默认配置作为基础
    let defaultConfig = {};
    try {
      defaultConfig = JSON.parse(fs.readFileSync(this.defaultConfigPath, 'utf8'));
      if (!configData) {
        configData = defaultConfig;
        configSource = this.defaultConfigPath;
        console.log(`✓ 使用默认配置: ${this.defaultConfigPath}`);
      }
    } catch (error) {
      throw new Error(`无法加载默认配置文件: ${this.defaultConfigPath}, 错误: ${error.message}`);
    }

    // 4. 合并配置（自定义配置覆盖默认配置）
    if (configSource !== this.defaultConfigPath) {
      this.config = this.mergeConfigurations(defaultConfig, configData);
      console.log(`✓ 配置合并完成，来源: ${configSource}`);
    } else {
      this.config = configData;
    }

    // 5. 验证配置
    this.validateConfiguration();
    
    // 6. 处理配置中的变量替换
    this.processConfigVariables();
  }

  /**
   * 深度合并配置对象
   * @param {Object} defaultConfig 默认配置 
   * @param {Object} customConfig 自定义配置
   * @returns {Object} 合并后的配置
   */
  mergeConfigurations(defaultConfig, customConfig) {
    const merged = JSON.parse(JSON.stringify(defaultConfig)); // 深拷贝

    const mergeRecursive = (target, source) => {
      for (const key in source) {
        if (source.hasOwnProperty(key)) {
          if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            mergeRecursive(target[key], source[key]);
          } else {
            target[key] = source[key];
          }
        }
      }
    };

    mergeRecursive(merged, customConfig);
    return merged;
  }

  /**
   * 验证配置文件的必要字段
   */
  validateConfiguration() {
    const requiredPaths = [
      'paths.baseUrl.searchPaths',
      'paths.routes.searchPaths', 
      'paths.api.directories',
      'urlConstants.mappings',
      'output.mobile',
      'output.pc'
    ];

    for (const path of requiredPaths) {
      if (!this.getNestedValue(this.config, path)) {
        throw new Error(`配置验证失败: 缺少必要配置项 '${path}'`);
      }
    }

    // 验证数组字段
    const arrayFields = [
      'paths.baseUrl.searchPaths',
      'paths.routes.searchPaths',
      'paths.api.directories'
    ];

    for (const path of arrayFields) {
      const value = this.getNestedValue(this.config, path);
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`配置验证失败: '${path}' 必须是非空数组`);
      }
    }

    console.log(`✓ 配置验证通过`);
  }

  /**
   * 处理配置中的变量替换
   */
  processConfigVariables() {
    // 在运行时替换变量的方法将在需要时调用
    // 这里只是预处理静态变量
  }

  /**
   * 获取嵌套对象的值
   * @param {Object} obj 对象
   * @param {string} path 路径，如 'a.b.c'
   * @returns {any} 值
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  /**
   * 设置嵌套对象的值
   * @param {Object} obj 对象
   * @param {string} path 路径
   * @param {any} value 值
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  // ===== 配置获取方法 =====

  /**
   * 获取baseUrl文件搜索路径
   * @param {string} srcRoot src根目录路径
   * @returns {Array<string>} 完整路径数组
   */
  getBaseUrlPaths(srcRoot) {
    const searchPaths = this.config.paths.baseUrl.searchPaths;
    return searchPaths.map(p => this.joinPath(srcRoot, p));
  }

  /**
   * 获取路由文件搜索路径
   * @param {string} srcRoot src根目录路径
   * @returns {Array<string>} 完整路径数组
   */
  getRoutePaths(srcRoot) {
    const searchPaths = this.config.paths.routes.searchPaths;
    return searchPaths.map(p => this.joinPath(srcRoot, p));
  }

  /**
   * 获取API目录搜索路径
   * @param {string} srcRoot src根目录路径
   * @returns {Array<string>} 完整路径数组
   */
  getApiDirectories(srcRoot) {
    const directories = this.config.paths.api.directories;
    return directories.map(d => this.joinPath(srcRoot, d));
  }

  /**
   * 获取URL常量映射
   * @returns {Object} 常量映射对象
   */
  getUrlConstantMappings() {
    return this.config.urlConstants.mappings;
  }

  /**
   * 获取视图路径映射规则
   * @returns {Array} 映射规则数组
   */
  getViewPathMappings() {
    return this.config.paths.views.mappings || [];
  }

  /**
   * 获取输出文件配置
   * @param {string} type 类型：'mobile' 或 'pc'
   * @returns {Object} 输出配置对象
   */
  getOutputConfig(type = 'mobile') {
    return this.config.output[type];
  }

  /**
   * 获取CSV表头配置
   * @param {string} type 类型：'mobile' 或 'pc' 
   * @returns {Array<string>} 表头数组
   */
  getCsvHeaders(type = 'mobile') {
    return this.config.output.csvHeaders[type];
  }

  /**
   * 获取分析行为配置
   * @returns {Object} 分析配置对象
   */
  getAnalysisConfig() {
    return this.config.analysis;
  }

  /**
   * 获取过滤规则配置
   * @returns {Object} 过滤配置对象
   */
  getFilterConfig() {
    return this.config.filters;
  }

  /**
   * 生成输出文件名
   * @param {string} projectName 项目名称
   * @param {string} type 类型：'mobile' 或 'pc'
   * @returns {string} 文件名
   */
  generateOutputFileName(projectName, type = 'mobile') {
    const outputConfig = this.getOutputConfig(type);
    let fileName = outputConfig.filename;
    
    // 替换变量
    fileName = fileName.replace('${projectName}', projectName);
    
    return fileName;
  }

  /**
   * 跨平台路径连接
   * @param {...string} paths 路径段
   * @returns {string} 连接后的路径
   */
  joinPath(...paths) {
    return paths.join('/').replace(/\/+/g, '/');
  }

  /**
   * 检查是否为API导入路径
   * @param {string} importPath 导入路径
   * @returns {boolean} 是否为API导入
   */
  isApiImport(importPath) {
    const apiDirs = this.config.paths.api.directories;
    return apiDirs.some(dir => 
      importPath.includes(`/${dir}/`) || 
      importPath.startsWith(`@/${dir}`) ||
      importPath.includes(`../${dir}/`) ||
      importPath.includes(`@/views/modules/`) // 保持原有的特殊路径兼容
    );
  }

  /**
   * 应用视图路径映射
   * @param {string} importPath 原始导入路径
   * @returns {string} 映射后的路径
   */
  applyViewPathMapping(importPath) {
    const mappings = this.getViewPathMappings();
    let mappedPath = importPath;
    
    for (const mapping of mappings) {
      if (importPath.startsWith(mapping.from)) {
        mappedPath = importPath.replace(mapping.from, mapping.to);
        break;
      }
    }
    
    return mappedPath;
  }

  /**
   * 解析URL常量
   * @param {string} constant 常量名
   * @returns {string} 解析后的URL
   */
  resolveUrlConstant(constant) {
    const mappings = this.getUrlConstantMappings();
    return mappings[constant] || constant;
  }

  /**
   * 导出当前配置到文件
   * @param {string} outputPath 输出路径
   */
  exportConfig(outputPath) {
    try {
      fs.writeFileSync(outputPath, JSON.stringify(this.config, null, 2), 'utf8');
      console.log(`✓ 配置已导出到: ${outputPath}`);
    } catch (error) {
      throw new Error(`导出配置失败: ${error.message}`);
    }
  }

  /**
   * 创建示例配置文件
   * @param {string} targetPath 目标路径
   */
  createExampleConfig(targetPath) {
    const exampleConfig = {
      name: "项目自定义配置示例",
      description: "复制并修改此配置以适应您的项目需求",
      
      // 只包含最常需要修改的配置项
      urlConstants: {
        mappings: {
          "YXXT_URL": "/yxxt/v3",
          "PATH": "/xssw/v3",
          "CUSTOM_API_URL": "/your/custom/api/v1"
        }
      },
      
      paths: {
        baseUrl: {
          searchPaths: [
            "api/baseUrl.js",
            "api/your-custom-baseUrl.js"
          ]
        }
      },
      
      output: {
        mobile: {
          filename: "${projectName}_mobile_analysis.csv"
        },
        pc: {
          filename: "${projectName}_pc_analysis.csv"
        }
      }
    };

    try {
      fs.writeFileSync(targetPath, JSON.stringify(exampleConfig, null, 2), 'utf8');
      console.log(`✓ 示例配置已创建: ${targetPath}`);
    } catch (error) {
      throw new Error(`创建示例配置失败: ${error.message}`);
    }
  }

  /**
   * 获取完整配置对象（用于调试）
   * @returns {Object} 完整配置
   */
  getFullConfig() {
    return JSON.parse(JSON.stringify(this.config));
  }
}

module.exports = ConfigManager;