# Vue API 分析器 (Vue API Analyzer)

强大的Vue项目API调用关系分析工具，采用双文件架构设计，专门针对PC端和移动端应用提供优化的分析方案。自动分析前端组件/页面与后端API的调用关系，包括前端组件/页面之间的父子关系，并生成详细的CSV报告。

## 🏗️ 项目架构

项目由两个核心分析器组成：

- **universal-vue-api-analyzer.js**：专门用于PC端Vue应用分析
- **enhanced-mobile-route-api-analyzer.js**：专门用于移动端Vue应用分析

两个分析器都能够深入分析前端组件/页面与后端API的调用关系，构建完整的组件层级结构图。

## 🚀 功能特性

- **📱 移动端路由支持**：专门优化的移动端Vue Router分析，支持复杂的嵌套路由结构
- **🔗 API调用关系分析**：自动识别组件中的API函数调用，解析URL和说明信息
- **🗺️ 完整路由映射**：构建完整的路由表，包括路由名称、路径、组件映射关系
- **📊 父子关系识别**：自动分析路由和组件的父子关系，构建层级结构
- **🔍 URL常量解析**：智能解析baseUrl.js中的URL常量，支持复杂的URL拼接逻辑
- **🌐 跨平台兼容**：支持Windows、macOS和Linux系统的路径处理，已完全解决Windows平台下的路径识别问题
- **📈 详细统计报告**：生成包含路由信息、API调用统计、使用频率等的详细CSV报告

## 📦 安装要求

- Node.js >= 12.0.0
- Vue项目（支持Vue 2.x和Vue 3.x）
- Vue Router

## 🛠️ 使用方法

### PC端应用分析

#### 命令行语法

```bash
node universal-vue-api-analyzer.js [src目录路径] [选项]
```

#### 基本用法

```bash
# 分析当前目录的src文件夹（默认）
node universal-vue-api-analyzer.js

# 分析指定的Vue项目src目录
node universal-vue-api-analyzer.js /path/to/vue/project/src

# 使用相对路径
node universal-vue-api-analyzer.js ./my-vue-app/src

# 指定输出文件名
node universal-vue-api-analyzer.js /path/to/src -o pc-analysis-report.csv
```

#### 帮助信息

```bash
node universal-vue-api-analyzer.js --help
# 或
node universal-vue-api-analyzer.js -h
```

### 移动端应用分析

#### 命令行语法

```bash
node enhanced-mobile-route-api-analyzer.js [src目录路径] [选项]
```

#### 基本用法

```bash
# 分析当前目录的src文件夹（默认）
node enhanced-mobile-route-api-analyzer.js

# 分析指定的Vue项目src目录
node enhanced-mobile-route-api-analyzer.js /path/to/vue/project/src

# 使用相对路径
node enhanced-mobile-route-api-analyzer.js ./my-vue-app/src

# 指定输出文件名
node enhanced-mobile-route-api-analyzer.js /path/to/src -o mobile-analysis-report.csv
```

#### 帮助信息

```bash
node enhanced-mobile-route-api-analyzer.js --help
# 或
node enhanced-mobile-route-api-analyzer.js -h
```

### 使用npm脚本

```bash
# 显示帮助信息
npm run help

# 开始移动端分析（使用默认参数）
npm run analyze

# 或者直接使用start
npm start /path/to/vue/project/src
```

## 📊 输出结果

### CSV报告文件

分析完成后会生成CSV文件：

- **PC端分析器**：文件名格式为 `{项目名}_universal_api_analysis.csv`
- **移动端分析器**：文件名格式为 `{项目名}_enhanced_route_api_analysis.csv`

### CSV文件结构

| 列名 | 说明 | 示例 |
|------|------|------|
| 文件路径 | 路由名称或组件路径 | `user_list`, `components/UserForm.vue` |
| 组件类型 | 路由层级信息 | `2级路由`, `3级路由` |
| 父组件 | 父路由或父组件名称 | `user_management` |
| 导入的API函数 | 检测到的API函数名 | `getUserList`, `deleteUser` |
| URL | 解析后的完整API地址 | `/api/v1/users/list` |
| 说明 | API函数的描述信息 | `获取用户列表` |
| 来自子组件 | 子组件信息 | 空或组件名 |
| 子组件路径 | 子组件路径 | 组件路径 |
| 导入的组件 | 导入的子组件 | 组件列表 |
| 是否有API调用 | 是否包含API调用 | `是`, `否` |

### 控制台输出示例

#### PC端分析器输出

```
🔍 开始分析Vue项目: /Users/username/project/src
📚 预加载URL常量...
🔗 预加载API文件...
🗂️  分析组件结构...
解析组件文件: /Users/username/project/src/views/UserManagement.vue
  发现API调用: getUserList -> /api/v1/users/list
  发现子组件: UserForm.vue
📊 生成CSV报告: src_universal_api_analysis.csv

✅ 分析完成！
📁 报告文件: /current/path/src_universal_api_analysis.csv
📈 组件数量: 32
📈 API记录数: 89
```

#### 移动端分析器输出

```
🔍 开始分析Vue项目: /Users/username/project/src
📚 预加载URL常量...
🔗 预加载API文件...
🗺️  构建完整路由表...
解析路由文件: /Users/username/project/src/router/routes.js
  处理路由数组: userManagement
    路由: user_list (user_list) -> /views/user/list.vue
    路由: user_detail (user_detail) -> /views/user/detail.vue
🎯 分析所有路由...
📊 生成CSV报告: src_enhanced_route_api_analysis.csv

✅ 分析完成！
📁 报告文件: /current/path/src_enhanced_route_api_analysis.csv
📈 路由数量: 45
📈 API记录数: 128

=== 分析统计 ===
处理了 45 个路由
检测到 128 个API调用关系
最常用的API (前5个):
  /api/v1/users/query: 8次调用
  /api/v1/auth/login: 6次调用
  /api/v1/system/config: 4次调用
```

## 🔧 工作原理

### PC端分析器 (universal-vue-api-analyzer.js)

#### 1. 组件文件扫描
- 递归扫描`src/`目录下的所有Vue组件文件
- 解析组件的导入语句和模板结构
- 识别组件之间的父子关系和层级结构

#### 2. API调用分析
- 解析Vue组件文件中的API导入语句
- 匹配API函数与预加载的API定义
- 生成完整的组件-API调用关系报告

### 移动端分析器 (enhanced-mobile-route-api-analyzer.js)

#### 1. 路由表构建
- 自动扫描Vue Router配置文件（`router/routes.js`, `router/index.js`等）
- 解析嵌套路由结构，建立完整的路由映射表
- 识别路由的父子关系和层级结构
- **强化路径解析**：优化了动态导入和相对路径的处理逻辑

#### 2. 路由组件分析
- 基于路由配置分析对应的页面组件
- 解析路由级别的API调用关系
- 构建路由-组件-API的完整映射
- **性能优化**：增强的缓存机制和并行处理能力

### 共同工作机制

#### 1. API文件预加载
- 扫描`src/api/`目录下的所有API文件
- 解析API函数定义和URL配置
- 缓存API函数与URL的映射关系

#### 2. URL常量解析
支持以下位置的URL常量文件：
- `src/api/baseUrl.js`
- `src/utils/baseUrl.js` 
- `src/config/baseUrl.js`
- `src/constants/baseUrl.js`

支持的常量格式：
```javascript
// 函数形式
export const API_URL = () => '/api/v1'

// 常量形式  
export const BASE_API = '/api/v1'

// 条件表达式
export const SERVICE_URL = () => {
  return process.env.NODE_ENV === 'production' ? '/api/v3' : '/api/dev'
}
```

## 📁 支持的项目结构

```
vue-project/
├── src/
│   ├── api/                    # API定义目录
│   │   ├── baseUrl.js         # URL常量配置
│   │   ├── user.js            # 用户相关API
│   │   ├── system.js          # 系统相关API
│   │   └── ...
│   ├── router/                 # 路由配置
│   │   ├── index.js           # 主路由文件
│   │   ├── routes.js          # 路由定义
│   │   └── modules/           # 路由模块
│   ├── views/                 # 页面组件
│   │   ├── user/              # 用户模块
│   │   │   ├── list.vue       # 用户列表
│   │   │   ├── detail.vue     # 用户详情
│   │   │   └── components/    # 用户模块组件
│   │   └── ...
│   └── components/            # 公共组件
└── ...
```

## ⚠️ 注意事项

### API识别要求
- API函数必须使用`export function`或`export const`形式定义
- Vue组件中必须使用`import { apiFunction } from '@/api/module'`语法导入
- URL定义需要包含在函数的`url`字段或request配置中

### 路由配置要求
- 路由配置需要标准的Vue Router格式
- 支持动态导入：`component: () => import('./views/User.vue')`
- 支持静态导入：`component: UserComponent`

### 文件路径处理
- 支持`@/`别名（映射到src目录）
- 支持相对路径和绝对路径
- 自动处理跨平台路径差异
- **Windows平台特别支持**：完全修复了Windows路径识别问题，确保API记录完整性

## 🐛 故障排除

### 常见问题

**Q: 路由没有被识别**
- 检查路由配置文件是否在标准位置（`router/`目录下）
- 确认路由配置使用标准Vue Router语法
- 查看控制台是否有路由解析错误信息

**Q: API调用没有被检测到**
- 确认API文件在`src/api/`目录下
- 检查API函数使用`export function`定义
- 确认Vue组件正确导入API函数

**Q: URL解析不正确**
- 检查`baseUrl.js`文件位置和格式
- 确认URL常量使用支持的定义方式
- 查看是否有复杂的条件逻辑需要手动处理

**Q: 生成的CSV文件为空或记录缺失**
- 确认源目录路径正确
- 检查项目结构是否符合要求
- 查看控制台错误信息
- **Windows用户特别提醒**：如果遇到API记录丢失问题，请确保使用最新版本（v2.1.0+），已完全修复此问题

## 📈 性能优化

- 使用缓存机制减少重复文件读取
- 并行处理多个文件以提高分析速度
- 智能跳过非相关文件类型
- 内存优化的大型项目支持

## 🔄 更新日志

### v2.1.0 (当前版本)
- 🐛 **重要修复**：完全解决Windows平台下的路径识别问题
- 🐛 **重要修复**：修复Windows环境下API记录丢失问题（从141条缺失恢复到完整记录）
- 🚀 优化跨平台路径处理策略，简化normalizePath方法
- 🔧 统一路径处理逻辑，提升跨平台兼容性
- 📝 完善Windows用户使用指南和故障排除说明

### v2.0.0
- ✨ 引入双文件架构设计
- ✨ 新增PC端专用分析器 (universal-vue-api-analyzer.js)
- ✨ 增强移动端分析器 (enhanced-mobile-route-api-analyzer.js)
- ✨ 新增命令行参数支持
- ✨ 新增输出文件路径自定义选项
- ✨ 改进的用户界面和进度提示
- 🐛 修复了重复记录问题
- 🐛 修复了多行导入解析问题
- 🚀 性能优化和内存使用改进
- 📝 完善的帮助文档和错误提示

### v1.0.0
- 基础的Vue路由和API分析功能
- 支持移动端项目结构
- CSV报告生成

## 📝 许可证

MIT License

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

---

如有问题或建议，请创建[Issue](https://github.com/your-repo/vue-api-analyzer/issues)进行讨论。