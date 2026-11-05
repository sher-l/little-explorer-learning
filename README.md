# 小小探险家

网站：https://sher-l.github.io/little-explorer-learning/ 。独立项目仓库，不替换账户原博客。网站文件在 `public/`，文件哈希见 `public/release-manifest.json`。

五区 25 关、125 次主线收集、五张完整绘画迷宫，小兔／小猫／小狗可选，支持重玩、图鉴、区域复习和内容包。20261105.14 为手柄和沙发距离增大文字、人物与引导，数学改为两位数与一位数加减，英语从字母和常见物品启蒙，五关各有渐进题池。

古诗保留范读，由旁边父母直接确认，不录音、不申请麦克风、不下载识别模型，也没有家长算术门槛。固定中英文 MP3 在开发机使用 Kokoro-82M-v1.1-zh 合成，按句加载；未匹配的新题用设备本地声音后备。来源及许可见 [声音声明](public/licenses/natural-voice/ATTRIBUTION.md)。不含儿童录音、旧 Microsoft Desktop 合成音频、存档、开发日志、密钥或原概念稿。代码和生成美术未另授开源再分发许可。

首次浏览器声音激活可能需要家长点一次，随后使用手柄。手柄采用标准映射；模拟测试不代表实体设备验收。声音已做文件和网页播放检查，不是逐条人工听审。

通过 GitHub Actions 手动运行 `Publish reviewed learning game` 发布。工作流只上传 `public/`，不会因 push 或定时任务自动部署。

迁移：旧设备在暂停 → 家长工具导出成长记录，新设备导入。站点使用独立 `little-explorer-learning.*` 键，不自动跨域复制存档。隐私与操作见 [家长说明](public/about.html)。
