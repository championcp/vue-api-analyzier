# Vue API分析工具 (Universal Vue API Analyzer)

一个强大的Vue项目API调用关系分析工具，能够自动分析Vue组件的层级关系、API调用情况，并生成详细的CSV报告。

## 🚀 功能特性

- **智能组件关系识别**：自动分析Vue组件之间的导入关系，构建完整的组件层级树
- **API调用分析**：识别组件中的API函数调用，解析URL和说明信息
- **URL常量解析**：自动解析baseUrl.js中的URL常量，支持复杂的URL拼接逻辑
- **跨平台兼容**：支持Windows、macOS和Linux系统的路径处理
- **灵活的路径输入**：支持相对路径和绝对路径参数
- **详细的分析报告**：生成包含组件层级、父子关系、API调用等信息的CSV报告

## 📦 安装要求

- Node.js (推荐版本 >= 14.0.0)
- Vue项目（支持Vue 2.x和Vue 3.x）

## 🛠️ 使用方法

### 基本用法

```bash
# 分析当前项目的src目录
node universal-vue-api-analyzer.js

# 分析指定的相对路径目录
node universal-vue-api-analyzer.js ./src/views/specific-module

# 分析指定的绝对路径目录
node universal-vue-api-analyzer.js /absolute/path/to/vue/components
```

### 高级用法示例

```bash
# 分析整个views目录
node universal-vue-api-analyzer.js ./src/views

# 跨项目分析（使用绝对路径）
node universal-vue-api-analyzer.js /Users/username/project/src/views/module

# 分析特定功能模块
node universal-vue-api-analyzer.js ./src/views/user-management
```

## 📊 输出结果

脚本会在当前目录生成一个CSV文件，文件名格式为：`{目录名}_api_extract_result.csv`

### CSV文件结构

| 列名 | 说明 | 示例 |
|------|------|------|
| 文件路径 | 组件相对于分析根目录的路径 | `components/UserList.vue` |
| 组件类型 | 基于Vue导入关系的组件层级 | `根组件`, `2级组件`, `3级组件` |
| 父组件 | 导入此组件的父组件路径 | `views/UserManagement.vue` |
| 导入的API函数 | 组件中使用的API函数名 | `getUserList`, `deleteUser` |
| URL | 解析后的完整API地址 | `/api/v1/users` |
| 说明 | API函数的注释说明 | `获取用户列表` |
| 来自子组件 | （预留字段） | 空 |
| 子组件路径 | （预留字段） | 空 |
| 导入的组件 | 此组件导入的子组件列表 | `UserForm, UserDetail` |
| 是否有API调用 | 组件是否包含API调用 | `是`, `否` |

### 示例输出

```csv
文件路径,组件类型,父组件,导入的API函数,URL,说明,来自子组件,子组件路径,导入的组件,是否有API调用
"list.vue","根组件","","getUserList","/api/v1/users","获取用户列表","","","UserForm, UserDetail","是"
"components/UserForm.vue","2级组件","list.vue","createUser","/api/v1/users","创建用户","","","","是"
"components/UserDetail.vue","2级组件","list.vue","getUserById","/api/v1/users/get","根据ID获取用户详情","","","","是"
```

## 🔧 工作原理

### 1. 项目结构识别
- 自动查找项目的`src`根目录
- 支持多种常见的项目结构和目录布局
- 智能处理相对路径和绝对路径输入

### 2. URL常量解析
脚本会查找并解析以下位置的`baseUrl.js`文件：
- `src/api/baseUrl.js`
- `src/utils/baseUrl.js`
- `src/config/baseUrl.js`
- `src/constants/baseUrl.js`
- `src/common/baseUrl.js`

支持的URL常量格式：
```javascript
// 函数形式
export const API_URL = () => {
  return BASE_URL() + '/api/v1'
}

// 常量形式
export const BASE_API = '/api/v1'

// 条件表达式
export const SERVICE_URL = () => {
  return SINGLE_APP() ? '' : '/api/v3'
}
```

### 3. 组件关系分析
- 解析Vue文件中的`import`语句
- 构建组件的父子关系图
- 基于导入关系计算组件层级（不是基于文件系统目录层级）

### 4. API调用识别
- 解析API文件中的`export function`
- 识别Vue组件中从API文件导入的函数
- 解析URL表达式和字符串拼接
- 提取函数注释作为API说明

## 📁 项目结构要求

脚本适用于以下Vue项目结构：

```
project/
├── src/
│   ├── api/                 # API函数定义
│   │   ├── baseUrl.js      # URL常量配置
│   │   ├── user.js         # 用户相关API
│   │   └── ...
│   ├── views/              # 页面组件
│   │   ├── user/
│   │   │   ├── list.vue
│   │   │   └── components/
│   │   │       ├── UserForm.vue
│   │   │       └── UserDetail.vue
│   │   └── ...
│   └── components/         # 公共组件
└── ...
```

## ⚠️ 注意事项

### 路径处理
- **相对路径**：如`./src/views/user`，基于当前工作目录
- **绝对路径**：如`/Users/username/project/src/views/user`，使用完整路径
- 两种方式都能正确处理，建议根据使用场景选择

### 组件层级计算
- 组件层级基于Vue的`import`关系，不是文件系统目录层级
- 没有被其他组件导入的组件被认为是"根组件"
- 层级数字表示从根组件开始的导入深度

### API识别限制
- 只识别从`@/api/`路径导入的API函数
- API函数必须使用`export function`形式定义
- URL表达式需要使用`url:`字段定义

## 🐛 常见问题

### Q: 父组件列为空
**A:** 这通常发生在以下情况：
- 组件之间没有使用Vue的`import`关系
- 组件路径解析出现问题
- 使用了脚本不支持的导入语法

**解决方案：**
- 确保使用相对路径（如`./src/views/module`）或正确的绝对路径
- 检查组件中是否正确使用了`import ComponentName from './path/to/component'`语法

### Q: API函数未被识别
**A:** 检查以下几点：
- API函数是否使用`export function`定义
- 组件中是否从`@/api/`路径正确导入
- baseUrl.js文件是否在预期位置

### Q: URL解析不正确
**A:** 确认：
- baseUrl.js文件格式是否符合要求
- URL常量定义是否使用支持的语法
- 是否存在复杂的条件逻辑需要手动处理

### Q: 跨项目分析出现问题
**A:** 当分析其他项目时：
- 确保使用完整的绝对路径
- 目标项目需要有正确的src目录结构
- 确保目标项目的API文件格式符合要求

## 💡 使用技巧

### 1. 分析特定模块
```bash
# 只分析用户管理模块
node universal-vue-api-analyzer.js ./src/views/user-management

# 只分析某个组件目录
node universal-vue-api-analyzer.js ./src/views/admin/components
```

### 2. 跨项目比较
```bash
# 分析项目A的某个模块
node universal-vue-api-analyzer.js /path/to/projectA/src/views/module

# 分析项目B的相同模块
node universal-vue-api-analyzer.js /path/to/projectB/src/views/module
```

### 3. 结果文件管理
生成的CSV文件会以目录名命名，如：
- `user-management_api_extract_result.csv`
- `admin_api_extract_result.csv`

可以重命名这些文件来避免覆盖，便于比较不同分析结果。

## 🔄 更新日志

### v1.1.0 (当前版本)
- 修复绝对路径参数处理问题
- 改进组件关系图构建逻辑
- 优化跨平台路径兼容性
- 增强错误处理和调试信息

### v1.0.0
- 支持基本的Vue组件和API分析
- 实现跨平台路径处理
- 支持相对路径和绝对路径输入

## 📝 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个工具！

---

如有问题或建议，请创建Issue进行讨论。