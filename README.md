# 🪰 Flappy Fly · 果蝇扑翼

果蝇版 Flappy Bird —— 灵感来自 [TuragaLab/flybody](https://github.com/TuragaLab/flybody):
DeepMind 与 HHMI Janelia 发表于 Nature(2025)的果蝇神经力学模型。

**在线游玩:** https://realjustadev.github.io/flappy-fly/

## 玩法

| 操作 | 键位 |
|---|---|
| 拍翅上升 | `空格` / `↑` / `W` / 鼠标点击 / 触屏 |
| 静音 | `M` 或右上角喇叭按钮 |
| 重开 | 死亡后 `空格`,游戏中 `R` |

- 穿越经典马里奥绿色水管,每过一墙 +1 分,速度渐快、缺口渐窄
- **触地即死**(致敬 flybody 的 `floor_contacts_fatal=True`)
- 每得 10 分触发加速提示,最佳成绩存在本地

## 与 flybody 的关系

flybody 是运行在 Python + [MuJoCo](https://mujoco.readthedocs.io/) 里的 59 维关节力矩果蝇模型,
无法直接跑在浏览器里。本项目是它的 **2D 网页致敬版**:保留"拍翅获得升力、
视觉引导飞越沟壑(bumps/trench 地形)、触地致命"这些核心设定,
用纯原生 Canvas 实现零依赖运行,音效由 WebAudio 实时合成。

想玩真·3D 物理版,请看上游仓库的 `fly-env-examples.ipynb`
(`vision_guided_flight` 就是本游戏的原型环境)。

## 本地运行

无需构建,任意静态服务器指向本目录即可:

```bash
python -m http.server 8000
# 打开 http://localhost:8000
```

或直接双击 `index.html`。
