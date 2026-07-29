# 第三方素材来源与授权

参赛作品会经过平台审核，任何外部素材都必须能说清出处与授权。这里逐条记录。

## 音效

| 文件 | 来源 | 原始文件名 | 授权 | 用途 |
|---|---|---|---|---|
| `assets/audio/sfx/pickup-paper.mp3` | [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) | `bookFlip1.ogg` | CC0 | 纸质道具拾取 |
| `assets/audio/sfx/pickup-cloth.mp3` | 同上 | `cloth2.ogg` | CC0 | 布质道具拾取 |
| `assets/audio/sfx/pickup-metal.mp3` | 同上 | `metalClick.ogg` | CC0 | 金属道具拾取 |
| `assets/audio/sfx/pickup-coin.mp3` | 同上 | `handleCoins.ogg` | CC0 | 零钱相关 |

**CC0 = 公共领域，可商用、免署名。** 原始许可文件见 `kenney-rpg-audio-CC0.txt`。
这里仍然记录出处，不是授权要求，而是审核时要拿得出证据。

全部转为**单声道 / 22.05kHz / 48kbps / ≤0.6 秒**——包体有 8,388,608 字节硬限
（平台上传接口实测拒收超限包），原始 ogg 每个 10~20KB 放不进去。

## 没有对应素材的材质

玻璃、塑料、肉感三种材质这个包里没有。它们不再等新素材，改由
`src/item-material.ts` 的 `MATERIAL_TONES` 用**音高倍率 + BiquadFilter**
从既有采样实时塑形——同一段声音换个音高、过不同滤波器，听感就能分开。
这条路子的好处是零包体成本，代价是不如真实录音有质感。
