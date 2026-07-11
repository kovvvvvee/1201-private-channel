# UI Specification - 1201私人频道

## Design Principle

整体优先级：

陪伴感 > 功能感

生活感 > 科幻感

情绪价值 > 游戏性

禁止出现：

- RPG界面
- 赛博朋克风格
- 飞船控制台
- 大量未来科技面板
- 复杂HUD

目标氛围：

沈星回和用户共同生活的家。

---

# Global Style

## Main Colors

星河紫

#9B7EFF

深空紫

#6B4FD0

淡星紫

#C4B5FD

暖米色

#F5E6D3

星光金

#FFEAA7

柔白光

#FFF9F0

---

## Glassmorphism

统一使用毛玻璃风格。

卡片背景：

rgba(255,255,255,0.15)

模糊：

blur(10px)

圆角：

16px24px

---

# Launch Screen

用户点击APP图标后：

私人频道连接中

↓

频道编号：1201

↓

今日权限已开启

↓

连接对象：沈星回

每段文字淡入淡出。

整体时长：

46秒。

结束进入首页。

---

# Home Page

## Layout Structure

页面分为：

背景层

角色层

导航层

---

## Background

使用已确定客厅背景图。

元素：

- 沙发
- 茶几
- 绿植
- 落地窗

要求：

全屏铺满。

无顶部留白。

增加：

rgba(155,126,255,0.12)

紫色滤镜。

添加极弱漂浮粒子。

---

## Character

使用透明底沈星回立绘。

位置：

屏幕左侧。

水平位置：

35%-40%。

高度：

屏幕高度45%左右。

角色为主要视觉中心。

---

## Character Interaction

点击立绘：

随机显示一句台词。

气泡位置：

人物右上方。

样式：

白色毛玻璃气泡。

圆角16px。

带尾巴指向人物。

---

## Homepage Dialogue Pool

今天这个频道，只为你开放。

猎人小姐，生日快乐。

要一起去看看吗？我陪你。

1201，我记得这个数字。

你在看什么？……我在看你。

---

## Key Easter Egg

钥匙隐藏在背景场景内。

推荐位置：

茶几附近。

首次进入：

闪烁3次。

之后不再提示。

点击：

播放生日快乐语音。

---

## Bottom Navigation

固定底部。

三个入口：

收藏夹

留言

特别通讯

布局：

水平居中。

间距均匀。

毛玻璃圆角按钮。

---

# Collection Page

## Header

左侧：

返回按钮。

中间：

收藏夹

---

## Main Content

左侧：

照片浏览区。

宽度：

60%-65%。

右侧：

Q版沈星回。

宽度：

25%左右。

---

## Photo Interaction

支持左右滑动。

支持移动端手势。

支持照片序号显示。

例如：

1 / 8

2 / 8

---

## Chibi Animation

持续上下浮动。

振幅：

35px。

周期：

2秒。

缓动动画。

---

## Chibi Reaction

切换照片时：

浮动幅度短暂增大。

随后恢复。

同时更新：

表情

评价内容

---

## Dialogue Bubble

位于Q版旁边。

白色或浅紫色背景。

不会自动消失。

始终显示当前照片评价。

---

## Pagination

底部显示照片圆点。

当前照片高亮。

颜色：

#9B7EFF

---

# Message Page

## Background

沿用首页背景。

增加：

12px20px

高斯模糊。

增加半透明遮罩。

---

## Intro Sequence

文字依次出现：

今天回来的时候……

↓

发现门口放着一个东西。

↓

好像是给你的。

每句持续约2秒。

淡入淡出。

轻微上浮。

---

## Envelope

文字结束后出现。

位置：

页面中央偏下。

带轻微浮动。

支持点击。

---

## Letter

点击信封：

信封淡出。

信纸出现。

信纸内容使用用户提供素材。

支持长图滚动。

---

## Exit

右上角关闭按钮。

或点击外围关闭。

返回首页。

---

# Communication Page

## Header

左侧：

返回按钮。

中间：

沈星回头像 + 名称。

右侧：

剩余次数徽章。

---

## Remaining Counter

显示：

📡 12

每发送一次消息：

减1。

变化时闪烁一次。

---

## Chat Area

消息上下排列。

自动滚动到底部。

支持长对话。

---

## User Bubble

靠右。

背景：

#E8D9FF → #D4C4FF

文字：

#2D2D3A

头像：

用户头像。

---

## Shen Xinghui Bubble

靠左。

背景：

#FFFFFF

边框：

#C4B5FD

文字：

#2D2D3A

头像：

沈星回头像。

---

## Multi Message Logic

AI返回多句内容时：

拆分多个气泡。

依次出现。

间隔：

0.5~1秒。

模拟真人聊天。

---

## Communication Limits

总次数：

12次。

用户每发送一次：

消耗1次。

AI回复不消耗次数。

---

## Special Stage

第8次：

追加

时间好像过得有点快……

第10次：

追加

剩下的不多了呢。

第12次：

进入结局。

---

## Ending

正常回复完成后：

特殊通讯权限即将结束。

↓

今天很开心。

↓

生日快乐。

↓

我在。

↓

频道关闭中……

---

## Closed State

再次进入：

弹窗显示：

📡 频道已关闭

禁止继续聊天。

---

# Typography

标题：

PingFang SC

Noto Sans CJK SC

正文：

PingFang SC

Noto Sans CJK SC

聊天文字：

Inter

SF Pro Text

留言页文字：

Playfair Display

Georgia

Zapfino

---

# Device Support

目标设备：

vivo X300（主目标）

兼容：

安卓主流旗舰机
iPhone 13及以上

目标浏览器：

微信内置浏览器（优先）
Chrome Android
Safari iOS

必须适配刘海屏和全面屏安全区域。

禁止固定像素布局。

采用响应式设计。

所有核心元素使用相对定位。