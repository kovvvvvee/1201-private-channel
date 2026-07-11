# 1201私人频道

一个送给朋友的生日礼物网站，基于《恋与深空》沈星回角色制作的私人通讯频道。

## 项目简介

这是一个只在生日当天开放的私人通讯频道，用户是沈星回的梦女。网站提供温馨的日常陪伴体验，包括收藏夹、留言和特别通讯功能。

## 技术栈

- React 18
- Vite
- React Router v6

## 项目结构

```
1201/
├── public/
│   └── assets/（所有素材放这里）
├── src/
│   ├── components/
│   │   ├── LaunchAnimation.jsx（开启动画）
│   │   ├── BottomNav.jsx（底部导航）
│   │   ├── Character.jsx（沈星回角色）
│   │   ├── KeyEasterEgg.jsx（钥匙彩蛋）
│   │   └── ChatBubble.jsx（聊天气泡）
│   ├── pages/
│   │   ├── Home.jsx（首页）
│   │   ├── Collection.jsx（收藏夹）
│   │   ├── Message.jsx（留言）
│   │   └── Chat.jsx（特别通讯）
│   ├── styles/
│   │   ├── global.css（全局样式）
│   │   ├── home.css
│   │   ├── collection.css
│   │   ├── message.css
│   │   ├── chat.css
│   │   ├── launch.css
│   │   ├── bottomNav.css
│   │   ├── character.css
│   │   ├── keyEasterEgg.css
│   │   └── chatBubble.css
│   ├── utils/
│   │   ├── chatLogic.js（聊天逻辑）
│   │   ├── audioControl.js（音频控制）
│   │   └── storage.js（状态持久化）
│   ├── data/
│   │   ├── characterDialogues.js（角色台词）
│   │   ├── photoComments.js（照片评价）
│   │   └── chatReplies.js（聊天回复）
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 安装和运行

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

### 3. 构建生产版本

```bash
npm run build
```

### 4. 预览生产版本

```bash
npm run preview
```

## 素材准备

在 `public/assets/` 目录下放置以下素材：

```
public/assets/
├── background/
│   └── home-bg.png（首页背景图）
├── character/
│   └── xinghui-home.png（沈星回站立图）
├── icons/
│   ├── xinghui-start.png（开启动画图标）
│   └── key.png（钥匙图标）
├── chibi/
│   ├── Q01.png
│   ├── Q02.png
│   ├── Q03.png
│   └── Q04.png（Q版沈星回）
├── audio/
│   └── birthday.mp3（生日快乐语音）
├── photos/
│   ├── photo1.jpg
│   ├── photo2.jpg
│   └── ...（照片文件，数量不限）
└── letter/
    ├── envelope.png（信封）
    └── letter.png（信纸）
```

## 功能说明

### 开启动画
点击启动图标后，依次显示连接信息，进入首页。

### 首页
- 公寓背景 + 紫色遮罩
- 沈星回站立图（点击随机对话）
- 隐藏钥匙彩蛋（首次闪烁3次，点击播放语音）
- 底部三个导航入口

### 收藏夹
- 左右滑动浏览照片
- Q版沈星回浮动动画
- 每张照片对应一句评价

### 留言
- 依次显示三句话
- 信封淡入
- 点击信封展开信纸

### 特别通讯
- 12轮聊天限制
- 多句回复拆分显示
- 特殊阶段追加内容
- 第12轮触发结局

## 配色规范

- 主色：#9B7EFF（星河紫）
- 深色：#6B4FD0（深空紫）
- 浅色：#C4B5FD（淡星紫）
- 暖色：#F5E6D3（暖米色）
- 金色：#FFEAA7（星光金）
- 白色：#FFF9F0（柔白光）

## 自定义内容

### 修改角色台词
编辑 `src/data/characterDialogues.js`

### 修改照片评价
编辑 `src/data/photoComments.js`

### 修改聊天回复
编辑 `src/data/chatReplies.js`

### 修改照片数量
编辑 `src/pages/Collection.jsx` 中的 `photoCount` 变量

## 注意事项

- 所有页面适配手机竖屏
- 使用毛玻璃效果和紫色主色调
- 频道关闭状态会保存在本地存储中
- 如需重置状态，可在浏览器控制台执行 `localStorage.clear()`

## 许可证

本项目为个人生日礼物，仅供私人使用。
