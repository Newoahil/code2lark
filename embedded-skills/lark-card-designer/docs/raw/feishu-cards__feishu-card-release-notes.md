# 飞书卡片更新说明

在保持旧版消息卡片原有能力的基础上，飞书卡片进行了全面升级。主要更新如下所示。

## 发布 JSON 2.0 结构

发布[2.0 版本](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-breaking-changes-release-notes)，提供了更丰富的卡片能力，支持在[飞书卡片搭建工具](https://open.feishu.cn/cardkit?from=open_docs_changelog)中搭建：
  - 支持适配大模型AI场景的流式输出能力。支持通过流式更新API，以实时或准实时的方式连续不断地更新，从而实现 AI 逐步生成、卡片逐步渲染的效果。流式更新使用方式可参考[流式更新 OpenAPI 调用指南](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/streaming-updates-openapi-overview#39ee4e65)。
  - 支持更丰富的富文本语法特性。[富文本（Markdown）](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/rich-text)组件新增支持多级标题、行内代码、表格、数字角标、引用等语法。

![image.png](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/86886de44a65abc18a28789d9e45c449_7qP9MHJjoY.png?height=1764&lazyload=true&maxWidth=600&width=2984)
  - 更灵活的布局能力。各类组件统一新增了包括排列方向，水平/垂直间距、内外边距在内的一系列布局属性。

![image.png](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/5ef3d34de57c92fac1af5d1079f622ac_5zLxtdzJ5X.png?height=1852&lazyload=true&maxWidth=600&width=2992)
  - 更便捷的多语言配置方式。飞书卡片搭建工具支持在组件属性上配置不同语言的内容，提升搭建多语言卡片的效率。卡片 JSON 支持配置局部多语言，详情参考[配置卡片多语言](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/configure-multi-language-content)。

![image.png](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/922fcb26148b26d07104ca9463dbd64c_wCKOtKZu9i.png?height=1732&lazyload=true&maxWidth=600&width=2996)

## **升级搭建工具，优化使用体验**

与消息卡片搭建工具相比，[飞书卡片搭建工具](https://open.feishu.cn/cardkit?from=open_docs_release_notes)进行了如下升级。了解搭建工具详细功能特性，参考[飞书卡片搭建工具概述](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/feishu-card-cardkit/feishu-cardkit-overview)。

- **完善卡片的资源管理逻辑，并支持协作开发卡片**
    - 提供独立的 **我的卡片** 页面，支持筛选 **我创建的卡片** 和 **我参与协作的卡片**，支持创建卡片副本
    - 支持为卡片添加协作者、应用、或自定义机器人。详情参考[管理卡片模板权限](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/feishu-card-cardkit/manage-card-template)
    - 支持在网络通畅时自动保存卡片编辑草稿至服务端，不再只缓存在浏览器本地
- **完善卡片搭建体验**
    - 可以更顺畅地通过拖拉拽、键盘快捷键的方式搭建卡片内容
    - 提供 **卡片大纲树** 页签，方便全览和选中卡片组件
- **完善变量的管理、绑定逻辑，使变量操作更易理解**
    - 优化卡片变量的管理逻辑，提升管理和绑定体验
    - 提供循环容器自动绑定对象数组的配置方式，可以更容易地控制可变列表内容

![Frame 1321318174.png](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/fd94550b89d1d400b4ac91bdb474bb03_7qNxWANXRz.png?height=1112&lazyload=true&maxWidth=600&width=2160)
## **丰富一批组件和属性扩展**

- 新增多图混排组件，最多支持混排九张图片。详情参考[多图混排](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/multi-image-laylout)。
- 新增输入框组件，支持收集用户的主观文本内容。详情参考[输入框组件](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/interactive-components/input)。
- 新增人员、人员列表组件，支持展示人员的用户名和头像，呈现人员信息更友好。详情参考[人员组件](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/user-profile)和[人员列表组件](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/user-list)。
- 新增表单容器，用于异步提交一组表单项内容。详情参考[表单容器](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/containers/form-container)。
- 新增表格和图表组件，仅支持通过撰写卡片 JSON 代码的方式使用。详情参考[表格组件](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/table)和[图表组件](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/chart)。
- 卡片标题新增图标、标签、副标题扩展。详情参考[标题组件](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/title)。
- 图片组件新增一批尺寸属性样式扩展。详情参考[图片组件](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/image)。
- 按钮组件新增一批样式和尺寸，并支持添加图标作为前缀图标。支持同时配置跳转链接和服务端数据回传交互，详情参考[按钮组件](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/interactive-components/button)。
- 分栏组件支持放置交互组件，并新增了一批对齐、间距属性，可以更灵活地调整内容混排样式。详情参考[分栏](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/containers/column-set)。
- 富文本组件支持嵌入飞书表情、标签内容；支持文本内容配置前缀图标；支持配置修改整体文本的字号。详情参考[富文本组件](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-components/content-components/rich-text)。

![Frame 1321318173.png](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/4e388f5693bcec8ff7b0ca5c1036cf5a_ggP2qDDLk8.png?height=1112&lazyload=true&maxWidth=600&width=2160)
## **支持更多卡片使用场景**

除消息卡片场景，飞书卡片还支持了链接预览场景和置顶卡片场景，并支持在搭建工具中预览场景中的效果。

### 链接预览场景

飞书卡片可以与飞书开放平台的链接预览能力相互关联，使飞书会话消息和群置顶中特定的链接通过飞书卡片实现内容预览。使用户在不跳转链接的情况下，直观洞察链接包含了哪些信息。链接预览能力介绍可参见[链接预览开发指南](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/development-link-preview/link-preview-development-guide)。

![Frame 1321318171.png](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/9e2c01a0f0703fb709e24838c3241f5b_ZTPJUZv7LA.png?height=1070&lazyload=true&maxWidth=400&width=1556)

### 置顶卡片场景

飞书卡片支持在飞书会话的置顶消息中展示。

![Frame 1321318172.png](//sf3-cn.feishucdn.com/obj/open-platform-opendoc/1c23d0604d8c3d98c27074174cbdd32d_hr786xPhzC.png?height=1070&lazyload=true&maxWidth=400&width=1164)
