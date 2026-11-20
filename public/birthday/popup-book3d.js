/**
 * 《林缨祈 KIKI 的5岁生日大冒险》V10 全屏 Three.js 真·3D 立体弹出书引擎
 *
 * V10 升级要点（合书开局 + 聚焦书本内部减杂物 + 人物真实可移动系统）：
 * 1. 开局精装合书：初始合上精美星夜烫金立体封面（正立标题 + KIKI 园景拱窗徽章 + 3D 小皇冠浮雕 + 丝带），
 *    点击封面 / 顶部按钮流畅 3D 铰链翻开并随书本摊开同步弹出第 1 页立体舞台。
 * 2. 聚焦书本内部：大幅收近阅读镜头（主书占屏宽 ~82–88%），移除大壁架/竖书/笔筒/小火车/大积木等外部杂物，
 *    4 件宝物缩轻点缀于远后桌面，远处柔和雾化聚焦中央立体书。
 * 3. 人物真实可移动：地面角色支持定时自然漫步 + 点击书页任意草地/空地领队与伙伴小跑前往 +
 *    侧向移动时平滑朝向翻转（皇冠与接触阴影实时跟随）+ 避开书页边界与花丛/礼盒/城堡/蛋糕障碍 +
 *    P2/P3/P4/P5 互动联动奔跑迎皇冠、颠气球、冲刺盘旋与助阵拼搭。
 */
import * as THREE from "./vendor/three.module.min.js";

var BOOK_W = 6.8;
var HALF_W = 3.4;
var BOOK_D = 4.36;
var COVER_H = 0.09;
var PAGE_TOP_Y = 0.27;
var WALL_H = 2.08;
var WALL_T = 0.04;
var WALL_Z = -BOOK_D * 0.5 + 0.07;
var STANDING_WALL_RAD = -0.12;
var WALL_V_RAD = 0.06;
var WALL_FOLD_BACK_RAD = 1.18;
var TURN_LIFT = 0.042;
var BOOK_OPEN_DURATION_MS = 1350;

var MAX_PIXEL_RATIO = 1.5;
var SHADOW_MAP_SIZE = 1024;
var POINTER_PICK_INTERVAL_MS = 32;

var FLIP_DURATION_MS = 1300;
var FLIP_FOLD_END = 0.3;
var FLIP_TURN_START = 0.3;
var FLIP_TURN_END = 0.74;
var FLIP_POP_START = 0.75;
var ENTRANCE_POP_MS = 950;

// 每页背景图的「后墙裁切窗口」(top..split) 与「地面取样区」(split..floorEnd)，单位为图高比例。
// split 行同时是后墙底边与地面顶边，保证折痕处像素连续；窗口高度 ≈0.6~0.72 使后墙横向拉伸 ≤1.3x。
var SPREAD_LAYOUT = {
  1: { top: 0.08, split: 0.795, floorEnd: 1.0 },
  2: { top: 0.12, split: 0.745, floorEnd: 1.0 },
  3: { top: 0.1, split: 0.7, floorEnd: 1.0 },
  4: { top: 0.05, split: 0.62, floorEnd: 1.0 },
  5: { top: 0.07, split: 0.685, floorEnd: 0.82 },
  6: { top: 0.3, split: 0.915, floorEnd: 1.0, tint: [206, 222, 168] },
  7: { top: 0.04, split: 0.685, floorEnd: 0.76, tint: [154, 106, 76], floorStyle: "warm-candle-table" },
  8: { top: 0.05, split: 0.655, floorEnd: 1.0 }
};

var CAM_PRESETS = {
  cover: {
    pos: new THREE.Vector3(0, 4.35, 5.85),
    look: new THREE.Vector3(0, 0.28, 0.05)
  },
  panoramic: {
    pos: new THREE.Vector3(0, 4.75, 7.55),
    look: new THREE.Vector3(0, 0.72, -0.25)
  },
  closer: {
    pos: new THREE.Vector3(0, 2.95, 5.15),
    look: new THREE.Vector3(0, 0.92, -0.35)
  }
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function smoothstep(e0, e1, x) {
  var t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function easeOutBack(t) {
  var c1 = 1.70158;
  var c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function quadBezier(p0, p1, p2, t) {
  var u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

// 摊开书页顶面的微弧高度（外缘略翘，与 floor 几何完全一致），立牌与接触阴影据此落地
function pageSurfaceY(x) {
  var n = clamp(1 - Math.abs(x) / HALF_W, 0, 1);
  return (1 - Math.pow(n, 2.2)) * 0.018;
}

function roundRectPath(ctx, x, y, w, h, r) {
  var rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function canvasTex(c, opts) {
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (opts && opts.repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/* ======================== 程序化纹理生成 ======================== */

function makeWoodTexture() {
  var c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  var ctx = c.getContext("2d");

  var grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, "#e5b88c");
  grad.addColorStop(0.5, "#dab082");
  grad.addColorStop(1, "#ce9e70");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  for (var row = 0; row < 4; row += 1) {
    var y0 = row * 128;
    ctx.fillStyle = row % 2 === 0 ? "rgba(255, 232, 200, 0.03)" : "rgba(128, 78, 38, 0.028)";
    ctx.fillRect(0, y0, 512, 128);
    ctx.fillStyle = "rgba(118, 72, 36, 0.075)";
    ctx.fillRect(0, y0 + 126, 512, 2);
  }

  for (var i = 0; i < 90; i += 1) {
    var y = (i * 23 + (i % 7) * 5) % 512;
    ctx.strokeStyle = i % 3 === 0 ? "rgba(130, 78, 38, 0.055)" : "rgba(255, 238, 210, 0.045)";
    ctx.lineWidth = 1 + (i % 2);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(170, y + (i % 5) - 2, 340, y - (i % 4) + 2, 512, y);
    ctx.stroke();
  }
  return canvasTex(c, { repeat: [3, 2] });
}

function makeWallpaperTexture(isNight) {
  var c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  var ctx = c.getContext("2d");

  var g = ctx.createLinearGradient(0, 0, 0, 512);
  if (isNight) {
    g.addColorStop(0, "#191238");
    g.addColorStop(0.55, "#261b50");
    g.addColorStop(1, "#352468");
  } else {
    g.addColorStop(0, "#ebd6b7");
    g.addColorStop(0.55, "#f5e4ca");
    g.addColorStop(1, "#faeedf");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = isNight ? "rgba(255, 255, 255, 0.035)" : "rgba(164, 118, 68, 0.055)";
  ctx.lineWidth = 2;
  for (var x = 0; x < 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  for (var i = 0; i < 38; i += 1) {
    var sx = ((i * 97 + 41) % 480) + 16;
    var sy = ((i * 137 + 23) % 460) + 20;
    var r = 2 + (i % 4);
    ctx.fillStyle = isNight ? "rgba(255, 232, 138, 0.52)" : "rgba(214, 162, 86, 0.28)";
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    if (i % 5 === 0) {
      ctx.beginPath();
      ctx.arc(sx + 18, sy + 12, 9, 0.25 * Math.PI, 1.75 * Math.PI);
      ctx.fillStyle = isNight ? "rgba(255, 224, 128, 0.36)" : "rgba(208, 152, 74, 0.22)";
      ctx.fill();
    }
  }
  return canvasTex(c, { repeat: [3.5, 2] });
}

function makeStarryCoverTexture() {
  var c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  var ctx = c.getContext("2d");
  var g = ctx.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, "#1d2658");
  g.addColorStop(0.5, "#2b3675");
  g.addColorStop(1, "#1a224d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  for (var i = 0; i < 42; i += 1) {
    var x = ((i * 79 + 23) % 480) + 16;
    var y = ((i * 113 + 37) % 480) + 16;
    ctx.fillStyle = i % 3 === 0 ? "rgba(255, 214, 102, 0.42)" : "rgba(255, 240, 190, 0.28)";
    ctx.beginPath();
    ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(232, 184, 104, 0.72)";
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, 488, 488);
  return canvasTex(c);
}

function drawFourPointStar(ctx, cx, cy, rOuter, rInner) {
  ctx.beginPath();
  for (var i = 0; i < 8; i += 1) {
    var a = (i / 8) * Math.PI * 2 - Math.PI * 0.5;
    var r = i % 2 === 0 ? rOuter : rInner;
    if (i === 0) {
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    } else {
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  }
  ctx.closePath();
  ctx.fill();
}

function drawFrontCoverCanvas(c, bgImg, kikiImg) {
  var W = c.width;
  var H = c.height;
  var ctx = c.getContext("2d");

  // 深星夜皇家蓝渐变底 + 细微布纹质感
  var bgGrad = ctx.createLinearGradient(0, 0, W * 0.85, H);
  bgGrad.addColorStop(0, "#1d265a");
  bgGrad.addColorStop(0.48, "#2c3878");
  bgGrad.addColorStop(1, "#18204c");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  for (var fy = 0; fy < H; fy += 6) {
    ctx.fillStyle = fy % 12 === 0 ? "rgba(255,255,255,0.018)" : "rgba(10,12,30,0.025)";
    ctx.fillRect(0, fy, W, 2);
  }
  for (var fx = 0; fx < W; fx += 8) {
    ctx.fillStyle = "rgba(255,244,210,0.012)";
    ctx.fillRect(fx, 0, 2, H);
  }

  // 左侧书脊压痕与烫金细线
  var spineShade = ctx.createLinearGradient(0, 0, 74, 0);
  spineShade.addColorStop(0, "rgba(10, 12, 28, 0.52)");
  spineShade.addColorStop(0.55, "rgba(255, 224, 156, 0.08)");
  spineShade.addColorStop(1, "rgba(10, 12, 28, 0)");
  ctx.fillStyle = spineShade;
  ctx.fillRect(0, 0, 74, H);

  // 背景轻盈星芒
  for (var s = 0; s < 56; s += 1) {
    var sx = 90 + ((s * 173 + 61) % (W - 140));
    var sy = 60 + ((s * 229 + 37) % (H - 120));
    ctx.fillStyle = s % 3 === 0 ? "rgba(255, 226, 138, 0.55)" : "rgba(255, 244, 212, 0.34)";
    if (s % 4 === 0) {
      drawFourPointStar(ctx, sx, sy, 8 + (s % 4) * 2, 2.5);
    } else {
      ctx.beginPath();
      ctx.arc(sx, sy, 2 + (s % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 双层复古烫金线框
  var goldGrad = ctx.createLinearGradient(80, 48, W - 48, H - 48);
  goldGrad.addColorStop(0, "#ffe49e");
  goldGrad.addColorStop(0.5, "#f0b94b");
  goldGrad.addColorStop(1, "#ffd97d");
  ctx.strokeStyle = goldGrad;
  ctx.lineWidth = 7;
  roundRectPath(ctx, 84, 52, W - 134, H - 104, 34);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 228, 158, 0.55)";
  ctx.lineWidth = 2.5;
  roundRectPath(ctx, 102, 70, W - 170, H - 140, 24);
  ctx.stroke();

  // 四角蔓藤小花纹装饰
  var corners = [
    [116, 84, 1, 1],
    [W - 82, 84, -1, 1],
    [116, H - 84, 1, -1],
    [W - 82, H - 84, -1, -1]
  ];
  for (var ci = 0; ci < corners.length; ci += 1) {
    var cr = corners[ci];
    ctx.save();
    ctx.translate(cr[0], cr[1]);
    ctx.scale(cr[2], cr[3]);
    ctx.strokeStyle = "rgba(255, 224, 146, 0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 44);
    ctx.quadraticCurveTo(4, 4, 44, 0);
    ctx.moveTo(10, 30);
    ctx.arc(20, 20, 8, Math.PI, Math.PI * 1.5);
    ctx.stroke();
    ctx.fillStyle = "#ffe6a6";
    drawFourPointStar(ctx, 16, 16, 7, 2.2);
    ctx.restore();
  }

  // 中央圆形魔法拱窗徽章（圆心 x=536, y=562, R=232）
  var cx = W * 0.525;
  var cy = 562;
  var radius = 232;

  var haloGrad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 1.38);
  haloGrad.addColorStop(0, "rgba(255, 214, 120, 0.34)");
  haloGrad.addColorStop(1, "rgba(255, 214, 120, 0)");
  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.38, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  if (bgImg) {
    var bw = bgImg.naturalWidth || bgImg.width || 1408;
    var bh = bgImg.naturalHeight || bgImg.height || 792;
    var scaleBg = Math.max((radius * 2) / bw, (radius * 2) / bh);
    var dw = bw * scaleBg;
    var dh = bh * scaleBg;
    ctx.drawImage(bgImg, cx - dw * 0.5, cy - dh * 0.5, dw, dh);
  } else {
    var innerBg = ctx.createRadialGradient(cx, cy - 50, 20, cx, cy, radius);
    innerBg.addColorStop(0, "#fff5cc");
    innerBg.addColorStop(0.52, "#ffd79c");
    innerBg.addColorStop(1, "#a2d8a8");
    ctx.fillStyle = innerBg;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  if (kikiImg) {
    var kw = kikiImg.naturalWidth || kikiImg.width || 512;
    var kh = kikiImg.naturalHeight || kikiImg.height || 990;
    var drawH = radius * 1.68;
    var drawW = drawH * (kw / kh);
    ctx.drawImage(kikiImg, cx - drawW * 0.5, cy - radius * 0.68, drawW, drawH);
  } else {
    ctx.fillStyle = "#ffbe0b";
    ctx.font = "900 172px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("5", cx, cy + 12);
  }

  // 圆窗内边缘柔光
  var rimIn = ctx.createRadialGradient(cx, cy, radius * 0.68, cx, cy, radius);
  rimIn.addColorStop(0, "rgba(255, 250, 232, 0)");
  rimIn.addColorStop(1, "rgba(38, 22, 54, 0.28)");
  ctx.fillStyle = rimIn;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();

  // 圆窗外双环烫金边框
  ctx.strokeStyle = goldGrad;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 245, 204, 0.72)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 18, 0, Math.PI * 2);
  ctx.stroke();

  // 顶部小文字丝带头衔（留足顶额给 3D 皇冠徽章）
  ctx.fillStyle = "#ffe9ad";
  ctx.font = "700 26px 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★  5TH BIRTHDAY POP-UP BOOK  ★", cx, 272);

  // 主标题（圆窗下方，正向清晰排版）
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 82px 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif";
  ctx.fillStyle = "rgba(18, 12, 34, 0.55)";
  ctx.fillText("林缨祈 KIKI", cx + 3, 892);
  var titleGrad = ctx.createLinearGradient(cx - 260, 845, cx + 260, 935);
  titleGrad.addColorStop(0, "#fff5cc");
  titleGrad.addColorStop(0.5, "#ffd166");
  titleGrad.addColorStop(1, "#ffe8a3");
  ctx.fillStyle = titleGrad;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(120, 74, 18, 0.75)";
  ctx.strokeText("林缨祈 KIKI", cx, 888);
  ctx.fillText("林缨祈 KIKI", cx, 888);

  ctx.font = "800 44px 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif";
  ctx.fillStyle = "#fff4dc";
  ctx.fillText("5 岁生日立体魔法书", cx, 976);
  ctx.restore();

  // 右下轻巧“点我翻开”箔金小徽章
  var bx = cx;
  var by = 1126;
  var bw2 = 340;
  var bh2 = 76;
  ctx.save();
  roundRectPath(ctx, bx - bw2 * 0.5, by - bh2 * 0.5, bw2, bh2, 38);
  var btnGrad = ctx.createLinearGradient(bx - bw2 * 0.5, by - bh2 * 0.5, bx + bw2 * 0.5, by + bh2 * 0.5);
  btnGrad.addColorStop(0, "rgba(255, 214, 102, 0.94)");
  btnGrad.addColorStop(1, "rgba(244, 162, 74, 0.94)");
  ctx.fillStyle = btnGrad;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#fff7dc";
  ctx.stroke();
  ctx.fillStyle = "#4b260c";
  ctx.font = "900 34px 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✨ 点我翻开魔法书", bx, by + 1);
  ctx.restore();
}

function makeFrontCoverTexture() {
  var c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1320;
  drawFrontCoverCanvas(c, null, null);
  var tex = canvasTex(c);
  engine.frontCoverCanvas = c;
  engine.frontCoverTex = tex;

  var bgImg = null;
  var kikiImg = null;
  function refreshCover() {
    if (!engine.frontCoverCanvas || !engine.frontCoverTex) {
      return;
    }
    drawFrontCoverCanvas(engine.frontCoverCanvas, bgImg, kikiImg);
    engine.frontCoverTex.needsUpdate = true;
  }
  loadImgCached(resolvePath("./assets/images/bg-01.webp")).then(function (img) {
    bgImg = img;
    refreshCover();
  }).catch(function () {});
  var base = (engine.storyData && engine.storyData.bookMeta && engine.storyData.bookMeta.spritesBasePath) || "./assets/sprites/";
  loadImgCached(resolvePath(base + "kiki-idle.webp")).then(function (img) {
    kikiImg = img;
    refreshCover();
  }).catch(function () {});

  return tex;
}

function makePageEdgeTexture() {
  var c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#efe3cb";
  ctx.fillRect(0, 0, 128, 64);
  for (var y = 0; y < 64; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? "rgba(156, 124, 88, 0.28)" : "rgba(255, 250, 238, 0.55)";
    ctx.fillRect(0, y, 128, 1.5);
  }
  return canvasTex(c, { repeat: [1, 1] });
}

function makePleatedShadeTexture() {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#fff5dc";
  ctx.fillRect(0, 0, 256, 128);
  for (var x = 0; x < 256; x += 8) {
    var gr = ctx.createLinearGradient(x, 0, x + 8, 0);
    gr.addColorStop(0, "rgba(182, 132, 74, 0.22)");
    gr.addColorStop(0.5, "rgba(255, 252, 244, 0.9)");
    gr.addColorStop(1, "rgba(182, 132, 74, 0.22)");
    ctx.fillStyle = gr;
    ctx.fillRect(x, 0, 8, 128);
  }
  return canvasTex(c);
}

// 带圆角斜面高光的字母积木贴图
function makeLetterBlockTexture(letter, bgHex, fgHex) {
  var c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  var ctx = c.getContext("2d");
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 128, 128);
  var bevel = ctx.createLinearGradient(0, 0, 128, 128);
  bevel.addColorStop(0, "rgba(255,255,255,0.42)");
  bevel.addColorStop(0.45, "rgba(255,255,255,0.04)");
  bevel.addColorStop(1, "rgba(40,20,10,0.26)");
  ctx.fillStyle = bevel;
  ctx.fillRect(0, 0, 128, 128);
  roundRectPath(ctx, 13, 13, 102, 102, 20);
  ctx.fillStyle = bgHex;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.62)";
  ctx.stroke();
  ctx.fillStyle = "rgba(40, 20, 10, 0.22)";
  ctx.font = "900 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, 66, 70);
  ctx.fillStyle = fgHex || "#ffffff";
  ctx.fillText(letter, 64, 67);
  return canvasTex(c);
}

function makeBookmarkTexture() {
  var c = document.createElement("canvas");
  c.width = 128;
  c.height = 384;
  var ctx = c.getContext("2d");
  var g = ctx.createLinearGradient(0, 0, 0, 384);
  g.addColorStop(0, "#1c254f");
  g.addColorStop(1, "#2b3972");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 384);
  ctx.strokeStyle = "#f7d06b";
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 112, 368);
  ctx.fillStyle = "#ffe8a3";
  ctx.beginPath();
  ctx.arc(64, 84, 26, 0.3 * Math.PI, 1.7 * Math.PI);
  ctx.arc(76, 76, 22, 1.62 * Math.PI, 0.38 * Math.PI, true);
  ctx.fill();
  ctx.fillStyle = "#ffbe0b";
  ctx.beginPath();
  ctx.arc(64, 182, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff5d8f";
  ctx.beginPath();
  ctx.arc(64, 262, 20, 0, Math.PI * 2);
  ctx.fill();
  return canvasTex(c);
}

function makeDustSpriteTexture() {
  var c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  var ctx = c.getContext("2d");
  var g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255, 248, 210, 1)");
  g.addColorStop(0.45, "rgba(255, 224, 130, 0.55)");
  g.addColorStop(1, "rgba(255, 224, 130, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return canvasTex(c);
}

// 无边框奶油卡纸（V8 的 strokeRect 边框会在墙/页面上形成白线，已移除）
function makeCreamPaperBaseTexture() {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#fbf3df";
  ctx.fillRect(0, 0, 256, 256);
  for (var i = 0; i < 650; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "rgba(180, 146, 102, 0.04)" : "rgba(255, 255, 255, 0.06)";
    ctx.fillRect((i * 73) % 256, (i * 41) % 256, 3, 2);
  }
  return canvasTex(c);
}

// 立牌脚下的接触 AO 软影（径向渐变，乘在纸面上）
function makeContactShadowTexture() {
  var c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  var ctx = c.getContext("2d");
  ctx.save();
  ctx.scale(1, 0.5);
  var g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(40, 22, 10, 0.95)");
  g.addColorStop(0.42, "rgba(40, 22, 10, 0.55)");
  g.addColorStop(1, "rgba(40, 22, 10, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.restore();
  var tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// 仙女星芒光晕（灯泡 / 烛光 / 盒内暖光共享）
function makeStarGlowTexture() {
  var c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  var ctx = c.getContext("2d");
  var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
  g.addColorStop(0, "rgba(255, 255, 255, 1)");
  g.addColorStop(0.16, "rgba(255, 246, 214, 0.85)");
  g.addColorStop(0.42, "rgba(255, 214, 140, 0.26)");
  g.addColorStop(1, "rgba(255, 200, 120, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.globalCompositeOperation = "lighter";
  for (var k = 0; k < 4; k += 1) {
    ctx.save();
    ctx.translate(64, 64);
    ctx.rotate((k * Math.PI) / 4);
    var len = k % 2 === 0 ? 60 : 36;
    var rg = ctx.createLinearGradient(-len, 0, len, 0);
    rg.addColorStop(0, "rgba(255, 236, 190, 0)");
    rg.addColorStop(0.5, "rgba(255, 250, 230, 0.75)");
    rg.addColorStop(1, "rgba(255, 236, 190, 0)");
    ctx.fillStyle = rg;
    ctx.fillRect(-len, -1.6, len * 2, 3.2);
    ctx.restore();
  }
  var tex = canvasTex(c);
  return tex;
}

function makeCandleStripeTexture(hex) {
  var c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, 64, 128);
  ctx.strokeStyle = hex;
  ctx.lineWidth = 11;
  for (var y = -64; y < 192; y += 30) {
    ctx.beginPath();
    ctx.moveTo(-4, y);
    ctx.lineTo(68, y + 40);
    ctx.stroke();
  }
  var sh = ctx.createLinearGradient(0, 0, 64, 0);
  sh.addColorStop(0, "rgba(255,255,255,0.25)");
  sh.addColorStop(1, "rgba(0,0,0,0.08)");
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, 64, 128);
  return canvasTex(c);
}

function makeGiftPaperTexture() {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  var ctx = c.getContext("2d");
  var g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#ffe08a");
  g.addColorStop(1, "#ffc94f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  for (var i = 0; i < 26; i += 1) {
    var x = ((i * 67 + 19) % 236) + 10;
    var y = ((i * 103 + 31) % 236) + 10;
    ctx.fillStyle = i % 3 === 0 ? "rgba(255, 255, 255, 0.7)" : (i % 3 === 1 ? "rgba(255, 128, 160, 0.55)" : "rgba(255, 170, 60, 0.5)");
    ctx.beginPath();
    var r = 4 + (i % 3) * 2;
    for (var k = 0; k < 10; k += 1) {
      var a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      var rr = k % 2 === 0 ? r : r * 0.45;
      if (k === 0) {
        ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      } else {
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
    }
    ctx.closePath();
    ctx.fill();
  }
  return canvasTex(c, { repeat: [1, 1] });
}

/* ======================== 模切纸边与双跨页纹理切割 ======================== */

function buildDieCutTexture(img) {
  var maxDim = 480;
  var iw = img.naturalWidth || img.width || 256;
  var ih = img.naturalHeight || img.height || 256;
  var scale = Math.min(1, maxDim / Math.max(iw, ih));
  var dw = Math.max(32, Math.round(iw * scale));
  var dh = Math.max(32, Math.round(ih * scale));
  var pad = 12;
  var outlinePx = 5;

  var silhouetteCanvas = document.createElement("canvas");
  silhouetteCanvas.width = dw + pad * 2;
  silhouetteCanvas.height = dh + pad * 2;
  var sCtx = silhouetteCanvas.getContext("2d");
  sCtx.drawImage(img, pad, pad, dw, dh);
  sCtx.globalCompositeOperation = "source-in";
  sCtx.fillStyle = "#fffaf0";
  sCtx.fillRect(0, 0, silhouetteCanvas.width, silhouetteCanvas.height);

  var outCanvas = document.createElement("canvas");
  outCanvas.width = dw + pad * 2;
  outCanvas.height = dh + pad * 2;
  var ctx = outCanvas.getContext("2d");
  var steps = 16;
  for (var k = 0; k < steps; k += 1) {
    var ang = (k / steps) * Math.PI * 2;
    ctx.drawImage(silhouetteCanvas, Math.cos(ang) * outlinePx, Math.sin(ang) * outlinePx);
  }
  ctx.drawImage(silhouetteCanvas, 0, 0);
  ctx.drawImage(img, pad, pad, dw, dh);

  var tex = canvasTex(outCanvas);
  return {
    texture: tex,
    aspect: outCanvas.width / outCanvas.height,
    padFracX: pad / outCanvas.width,
    padFracY: pad / outCanvas.height,
    innerFracX: dw / outCanvas.width,
    innerFracY: dh / outCanvas.height
  };
}

function sampleGroundColor(img, iw, ih, y0, y1) {
  try {
    var c = document.createElement("canvas");
    c.width = 8;
    c.height = 2;
    var ctx = c.getContext("2d");
    ctx.drawImage(img, 0, y0, iw, Math.max(4, y1 - y0), 0, 0, 8, 2);
    var data = ctx.getImageData(0, 0, 8, 2).data;
    var r = 0;
    var g = 0;
    var b = 0;
    for (var i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    var n = data.length / 4;
    // 向奶油纸色靠拢并略微提亮，保持温柔的印刷感（避免地面发灰）
    return [
      Math.min(255, Math.round((r / n) * 0.66 + 250 * 0.34 + 6)),
      Math.min(255, Math.round((g / n) * 0.66 + 242 * 0.34 + 8)),
      Math.min(255, Math.round((b / n) * 0.66 + 214 * 0.34))
    ];
  } catch (err) {
    return [226, 226, 196];
  }
}

function buildSpreadTexturesFromBg(img, pageNum) {
  var iw = img.naturalWidth || img.width || 1408;
  var ih = img.naturalHeight || img.height || 792;
  var lay = SPREAD_LAYOUT[pageNum] || { top: 0.06, split: 0.66, floorEnd: 1.0 };
  var wallTopY = Math.round(ih * lay.top);
  var splitY = Math.round(ih * lay.split);
  var floorEndY = Math.round(ih * (lay.floorEnd || 1));
  var wallSrcH = Math.max(8, splitY - wallTopY);
  var stripH = Math.max(6, floorEndY - splitY);
  var halfSrcW = iw * 0.5;
  var ground = lay.tint || sampleGroundColor(img, iw, ih, splitY, floorEndY);
  var groundRgb = ground[0] + ", " + ground[1] + ", " + ground[2];

  // 1) 左右后墙：全出血绘画（无白框），书脊侧自然折痕阴影 + 底边轻触地暗影
  function makeHalfWallTex(srcX, isLeft) {
    var cw = 768;
    var ch = 480;
    var c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    var ctx = c.getContext("2d");
    ctx.drawImage(img, srcX, wallTopY, halfSrcW, wallSrcH, 0, 0, cw, ch);

    var creaseW = 46;
    var cg = ctx.createLinearGradient(isLeft ? cw - creaseW : creaseW, 0, isLeft ? cw : 0, 0);
    cg.addColorStop(0, "rgba(46, 28, 18, 0)");
    cg.addColorStop(1, "rgba(46, 28, 18, 0.15)");
    ctx.fillStyle = cg;
    ctx.fillRect(isLeft ? cw - creaseW : 0, 0, creaseW, ch);

    var foot = ctx.createLinearGradient(0, ch - 26, 0, ch);
    foot.addColorStop(0, "rgba(40, 24, 14, 0)");
    foot.addColorStop(1, "rgba(40, 24, 14, 0.1)");
    ctx.fillStyle = foot;
    ctx.fillRect(0, ch - 26, cw, 26);

    ctx.fillStyle = "rgba(255, 250, 238, 0.4)";
    ctx.fillRect(0, 0, cw, 2);
    return canvasTex(c);
  }

  // 2) 左右水平地面：P7 使用温馨焦糖木桌烛光面，其余页折痕接续 + 镜像延展
  function makeFloorTex(srcX, isLeft) {
    var cw = 768;
    var ch = 512;
    var c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    var ctx = c.getContext("2d");

    if (lay.floorStyle === "warm-candle-table") {
      var tblG = ctx.createLinearGradient(0, 0, 0, ch);
      tblG.addColorStop(0, "#764130");
      tblG.addColorStop(0.28, "#91593f");
      tblG.addColorStop(0.62, "#aa6f4e");
      tblG.addColorStop(1, "#8f593e");
      ctx.fillStyle = tblG;
      ctx.fillRect(0, 0, cw, ch);

      // 细腻无缝横木纹（以全局 y 行统一绘制，跨书脊完全连贯）
      for (var wy = 14; wy < ch; wy += 24) {
        ctx.fillStyle = wy % 48 === 14 ? "rgba(62, 30, 18, 0.08)" : "rgba(255, 226, 188, 0.05)";
        ctx.fillRect(0, wy, cw, 2);
      }

      // 中央蛋糕区柔和暖金烛光散射
      var candleGlow = ctx.createRadialGradient(isLeft ? cw : 0, ch * 0.44, 16, isLeft ? cw : 0, ch * 0.44, cw * 0.85);
      candleGlow.addColorStop(0, "rgba(255, 214, 150, 0.34)");
      candleGlow.addColorStop(0.45, "rgba(255, 190, 118, 0.14)");
      candleGlow.addColorStop(1, "rgba(255, 190, 118, 0)");
      ctx.fillStyle = candleGlow;
      ctx.fillRect(0, 0, cw, ch);

      // 少量柔和金色光斑点缀，与后墙梦境辉光呼应
      for (var bi = 0; bi < 14; bi += 1) {
        var bx = isLeft ? ((bi * 151 + 43) % (cw - 60)) + 30 : ((bi * 173 + 89) % (cw - 60)) + 30;
        var by = ((bi * 97 + 29) % Math.round(ch * 0.72)) + 26;
        var br = 12 + (bi % 4) * 7;
        var bgG = ctx.createRadialGradient(bx, by, 1, bx, by, br);
        bgG.addColorStop(0, "rgba(255, 232, 186, 0.14)");
        bgG.addColorStop(1, "rgba(255, 210, 145, 0)");
        ctx.fillStyle = bgG;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }

      // 横跨书脊中央的香槟金蕾丝派对桌旗（柔和乳白锦缎 + 扇形蕾丝金边 + 小星点）
      var runnerW = 118;
      var rx = isLeft ? cw - runnerW : 0;
      var outerEdgeX = isLeft ? rx : runnerW;
      ctx.fillStyle = "rgba(255, 246, 232, 0.76)";
      ctx.fillRect(rx, 0, runnerW, ch);
      ctx.fillStyle = "rgba(255, 230, 192, 0.28)";
      ctx.fillRect(isLeft ? rx + 14 : 0, 0, runnerW - 14, ch);
      ctx.fillStyle = "rgba(232, 182, 86, 0.85)";
      for (var sy = 10; sy < ch; sy += 20) {
        ctx.beginPath();
        ctx.arc(outerEdgeX, sy, 9, isLeft ? Math.PI * 0.5 : -Math.PI * 0.5, isLeft ? Math.PI * 1.5 : Math.PI * 0.5, false);
        ctx.fillStyle = "rgba(255, 247, 234, 0.78)";
        ctx.fill();
        ctx.strokeStyle = "rgba(226, 173, 74, 0.65)";
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(226, 173, 74, 0.72)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(outerEdgeX + (isLeft ? 10 : -10), 0);
      ctx.lineTo(outerEdgeX + (isLeft ? 10 : -10), ch);
      ctx.stroke();
      ctx.strokeStyle = "rgba(244, 194, 112, 0.5)";
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(outerEdgeX + (isLeft ? 20 : -20), 0);
      ctx.lineTo(outerEdgeX + (isLeft ? 20 : -20), ch);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(247, 200, 104, 0.55)";
      for (var stY = 28; stY < ch; stY += 46) {
        var stX = isLeft ? rx + 52 : 66;
        ctx.beginPath();
        ctx.arc(stX, stY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "rgb(" + groundRgb + ")";
      ctx.fillRect(0, 0, cw, ch);

      var k = cw / halfSrcW;
      var destH = Math.round(clamp(stripH * k, ch * 0.24, ch * 0.68));
      var tileIdx = 0;
      for (var yCursor = 0; yCursor < ch * 0.92; yCursor += destH) {
        ctx.save();
        if (tileIdx % 2 === 1) {
          ctx.translate(0, yCursor * 2 + destH);
          ctx.scale(1, -1);
          ctx.drawImage(img, srcX, splitY, halfSrcW, stripH, 0, yCursor, cw, destH + 1);
        } else {
          ctx.drawImage(img, srcX, splitY, halfSrcW, stripH, 0, yCursor, cw, destH + 1);
        }
        ctx.restore();
        tileIdx += 1;
      }

      var washTop = destH * 0.55;
      var wash = ctx.createLinearGradient(0, washTop, 0, ch);
      wash.addColorStop(0, "rgba(" + groundRgb + ", 0)");
      wash.addColorStop(0.42, "rgba(" + groundRgb + ", 0.24)");
      wash.addColorStop(0.82, "rgba(" + groundRgb + ", 0.52)");
      wash.addColorStop(1, "rgba(" + groundRgb + ", 0.72)");
      ctx.fillStyle = wash;
      ctx.fillRect(0, washTop, cw, ch - washTop);

      var front = ctx.createLinearGradient(0, ch * 0.84, 0, ch);
      front.addColorStop(0, "rgba(248, 239, 218, 0)");
      front.addColorStop(1, "rgba(248, 239, 218, 0.72)");
      ctx.fillStyle = front;
      ctx.fillRect(0, ch * 0.84, cw, ch * 0.16);

      var outerW = 54;
      var og = ctx.createLinearGradient(isLeft ? outerW : cw - outerW, 0, isLeft ? 0 : cw, 0);
      og.addColorStop(0, "rgba(248, 239, 218, 0)");
      og.addColorStop(1, "rgba(248, 239, 218, 0.55)");
      ctx.fillStyle = og;
      ctx.fillRect(isLeft ? 0 : cw - outerW, 0, outerW, ch);
    }

    // 后墙折痕处的接触 AO（读作纸张折线，而不是白缝）
    var ao = ctx.createLinearGradient(0, 0, 0, 30);
    ao.addColorStop(0, "rgba(40, 24, 14, 0.22)");
    ao.addColorStop(1, "rgba(40, 24, 14, 0)");
    ctx.fillStyle = ao;
    ctx.fillRect(0, 0, cw, 30);

    var spineW = 48;
    var sg = ctx.createLinearGradient(isLeft ? cw - spineW : spineW, 0, isLeft ? cw : 0, 0);
    sg.addColorStop(0, "rgba(38, 22, 16, 0)");
    sg.addColorStop(1, "rgba(38, 22, 16, 0.18)");
    ctx.fillStyle = sg;
    ctx.fillRect(isLeft ? cw - spineW : 0, 0, spineW, ch);

    for (var s = 0; s < 360; s += 1) {
      ctx.fillStyle = s % 2 === 0 ? "rgba(166, 132, 92, 0.035)" : "rgba(255,255,255,0.05)";
      ctx.fillRect((s * 89) % cw, (s * 53) % ch, 2, 2);
    }
    return canvasTex(c);
  }

  return {
    leftWallTex: makeHalfWallTex(0, true),
    rightWallTex: makeHalfWallTex(halfSrcW, false),
    leftFloorTex: makeFloorTex(0, true),
    rightFloorTex: makeFloorTex(halfSrcW, false)
  };
}

/* ======================== 核心引擎状态 ======================== */

var engine = {
  ready: false,
  failed: false,
  canvas: null,
  storyData: null,
  callbacks: {},
  renderer: null,
  scene: null,
  camera: null,
  raycaster: new THREE.Raycaster(),
  pointerNdc: new THREE.Vector2(-99, -99),
  hoveredObj: null,

  // 相机与镜头状态
  lookCloser: false,
  camMix: 0,
  targetCamMix: 0,
  targetNx: 0,
  targetNy: 0,
  curNx: 0,
  curNy: 0,
  tmpCamPos: new THREE.Vector3(),
  tmpCamLook: new THREE.Vector3(),
  tmpReadPos: new THREE.Vector3(),
  tmpReadLook: new THREE.Vector3(),

  // 书房环境
  wallMesh: null,
  dayWallTex: null,
  nightWallTex: null,
  ambLight: null,
  hemiLight: null,
  keyLight: null,
  lampLight: null,
  lampShadeMat: null,
  lampBulbMat: null,
  rimLight: null,
  dustPoints: null,
  dustMat: null,
  souvenirs: {},
  unlockedMap: {},
  isNight: false,

  // 实体精装书与封面开合 / 页堆
  bookRoot: null,
  bookState: "closed",
  bookOpenFactor: 0,
  bookOpenAnim: null,
  coverHoverMix: 0,
  frontCoverPivot: null,
  frontCoverMesh: null,
  frontCoverFrontGroup: null,
  frontCoverHitMesh: null,
  spineBackMesh: null,
  frontCoverMat: null,
  frontCoverCanvas: null,
  frontCoverTex: null,
  leftStackMesh: null,
  rightStackMesh: null,
  leftFloorMesh: null,
  rightFloorMesh: null,
  leftFloorMat: null,
  rightFloorMat: null,
  creamPaperTex: null,
  deferredFloor: null,
  walkRingMesh: null,
  walkRingAnim: null,

  // 书脊共铰链 V 形后墙（左/右）
  leftWallPivot: null,
  rightWallPivot: null,
  leftWallMat: null,
  rightWallMat: null,

  // 翻页弧面纸片
  turnPivot: null,
  turnMesh: null,
  turnGeo: null,
  turnBaseCoords: null,
  turnMat: null,
  turnBackMat: null,

  // 当前页立牌 & 3D 交互道具 & 移动障碍
  dioramaGroup: null,
  standees: {},
  standeeList: [],
  obstacles: [],
  activeActorId: null,
  foldables: [],
  interactables: [],

  // 共享资源
  hitMat: null,
  contactTex: null,
  glowTex: null,
  propTexCache: {},

  // 页面专有 3D 物件引用
  p1Flowers: [],
  p1ButterflyFocus: null,
  p1EnteringGate: null,
  p2Parcel: null,
  p2Delivery: null,
  p3Balloons: [],
  p4Badges: [],
  p5Bricks: [],
  p5Car: null,
  p6Lights: null,
  p6LightWave: null,
  p6TreasureStage: null,
  p7Candles: [],
  p7CandleLight: null,
  p7Cloud: null,
  p7Treats: [],
  p7TeaFlames: [],
  p7BlowAnim: null,
  p8Trails: { nextFwTs: 0 },
  butterflies: [],

  // 预分配粒子池（InstancedMesh，零 GC）
  particleGroup: null,
  pools: null,
  tmpObj: new THREE.Object3D(),
  tmpColor: new THREE.Color(),
  zeroMatrix: new THREE.Matrix4().makeScale(0, 0, 0),

  // 翻页 / 入场动画状态
  currentPage: 1,
  hasBuilt: false,
  buildToken: 0,
  pageStateRef: null,
  isFlipping: false,
  flipAnim: null,
  popAnim: null,

  // 缓存与懒加载
  imagePromises: {},
  spreadCache: {},
  spreadPromises: {},
  dieCutCache: {},
  dieCutPromises: {},
  preloadQueue: [],
  preloadBusy: false,

  // 性能调度
  rafId: null,
  pageHidden: false,
  hiddenSinceTs: 0,
  frameCount: 0,
  lastPickTs: 0,
  pickTimer: null,
  pendingPointer: null,
  lastWidth: 0,
  lastHeight: 0,
  lastTickTs: 0
};

function resolvePath(rawPath) {
  if (!rawPath) {
    return "";
  }
  var v = (engine.storyData && engine.storyData.bookMeta && engine.storyData.bookMeta.assetVersion) || "11";
  return rawPath.indexOf("?") >= 0 ? rawPath : rawPath + "?v=" + v;
}

function loadImgCached(url) {
  if (!url) {
    return Promise.reject(new Error("Empty image url"));
  }
  if (engine.imagePromises[url]) {
    return engine.imagePromises[url];
  }
  engine.imagePromises[url] = new Promise(function (resolve, reject) {
    var img = new Image();
    img.decoding = "async";
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function (err) {
      delete engine.imagePromises[url];
      reject(err || new Error("Image load failed: " + url));
    };
    img.src = url;
  });
  return engine.imagePromises[url];
}

function getOrLoadDieCut(spriteName) {
  var base = (engine.storyData && engine.storyData.bookMeta && engine.storyData.bookMeta.spritesBasePath) || "./assets/sprites/";
  var url = resolvePath(base + spriteName);
  if (engine.dieCutCache[url]) {
    return Promise.resolve(engine.dieCutCache[url]);
  }
  if (engine.dieCutPromises[url]) {
    return engine.dieCutPromises[url];
  }
  engine.dieCutPromises[url] = loadImgCached(url).then(function (img) {
    var built = buildDieCutTexture(img);
    engine.dieCutCache[url] = built;
    delete engine.dieCutPromises[url];
    return built;
  }, function (err) {
    delete engine.dieCutPromises[url];
    throw err;
  });
  return engine.dieCutPromises[url];
}

function getPageData(pageNum) {
  var pages = (engine.storyData && engine.storyData.pages) || [];
  for (var i = 0; i < pages.length; i += 1) {
    if (pages[i].pageNumber === pageNum) {
      return pages[i];
    }
  }
  return null;
}

function getOrLoadSpread(pageNum) {
  if (engine.spreadCache[pageNum]) {
    return Promise.resolve(engine.spreadCache[pageNum]);
  }
  if (engine.spreadPromises[pageNum]) {
    return engine.spreadPromises[pageNum];
  }
  var pg = getPageData(pageNum);
  if (!pg) {
    return Promise.reject(new Error("Missing page " + pageNum));
  }
  engine.spreadPromises[pageNum] = loadImgCached(resolvePath(pg.image)).catch(function () {
    return loadImgCached(resolvePath(pg.fallbackImage || pg.image));
  }).then(function (img) {
    var res = buildSpreadTexturesFromBg(img, pageNum);
    engine.spreadCache[pageNum] = res;
    delete engine.spreadPromises[pageNum];
    return res;
  }, function (err) {
    delete engine.spreadPromises[pageNum];
    throw err;
  });
  return engine.spreadPromises[pageNum];
}

/* ---------------- 懒加载：空闲时预热 ±1 页（贴图烘焙 + GPU 上传），并回收远端页 ---------------- */

function scheduleIdle(fn) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(fn, { timeout: 1500 });
  } else {
    window.setTimeout(fn, 80);
  }
}

function uploadTexture(tex) {
  if (tex && engine.renderer && typeof engine.renderer.initTexture === "function") {
    try {
      engine.renderer.initTexture(tex);
    } catch (err) {
      /* 上传失败时交给首次渲染兜底 */
    }
  }
}

function collectPageSprites(pageNum) {
  var pg = getPageData(pageNum);
  var out = [];
  if (!pg) {
    return out;
  }
  var actors = pg.actors || [];
  for (var i = 0; i < actors.length; i += 1) {
    var a = actors[i];
    if (a.sprite && !(pageNum === 2 && a.id === "p2-parcel-box") && out.indexOf(a.sprite) < 0) {
      out.push(a.sprite);
    }
    if (a.role === "kiki" && out.indexOf("kiki-cheer.webp") < 0) {
      out.push("kiki-cheer.webp");
    }
  }
  return out;
}

function scheduleAdjacentPreload(pageNum) {
  var total = (engine.storyData && engine.storyData.pages && engine.storyData.pages.length) || 8;
  var queue = [];
  var targets = [pageNum + 1, pageNum - 1];
  for (var t = 0; t < targets.length; t += 1) {
    var p = targets[t];
    if (p < 1 || p > total) {
      continue;
    }
    if (!engine.spreadCache[p]) {
      queue.push({ kind: "spread", page: p });
    }
    var sprites = collectPageSprites(p);
    for (var s = 0; s < sprites.length; s += 1) {
      queue.push({ kind: "sprite", name: sprites[s] });
    }
  }
  engine.preloadQueue = queue;
  pumpPreloadQueue();
}

function pumpPreloadQueue() {
  if (engine.preloadBusy || engine.preloadQueue.length === 0) {
    return;
  }
  engine.preloadBusy = true;
  scheduleIdle(function () {
    var job = engine.preloadQueue.shift();
    var prom = Promise.resolve();
    if (job && job.kind === "spread") {
      prom = getOrLoadSpread(job.page).then(function (sp) {
        uploadTexture(sp.leftWallTex);
        uploadTexture(sp.rightWallTex);
        uploadTexture(sp.leftFloorTex);
        uploadTexture(sp.rightFloorTex);
      });
    } else if (job && job.kind === "sprite") {
      prom = getOrLoadDieCut(job.name).then(function (dc) {
        uploadTexture(dc.texture);
      });
    }
    prom.catch(function () {
      return null;
    }).then(function () {
      engine.preloadBusy = false;
      pumpPreloadQueue();
    });
  });
}

function evictFarSpreads(pageNum) {
  if (engine.isFlipping) {
    return;
  }
  var keys = Object.keys(engine.spreadCache);
  for (var i = 0; i < keys.length; i += 1) {
    var p = Number(keys[i]);
    if (Math.abs(p - pageNum) > 2) {
      var sp = engine.spreadCache[p];
      if (sp) {
        sp.leftWallTex.dispose();
        sp.rightWallTex.dispose();
        sp.leftFloorTex.dispose();
        sp.rightFloorTex.dispose();
      }
      delete engine.spreadCache[p];
    }
  }
}

function getPropTexture(key, factory) {
  if (!engine.propTexCache[key]) {
    engine.propTexCache[key] = factory();
  }
  return engine.propTexCache[key];
}

/* ======================== 书房桌面与 4 件真实宝物 ======================== */

function shadowAll(group, cast, receive) {
  group.traverse(function (ch) {
    if (ch.isMesh) {
      ch.castShadow = cast;
      ch.receiveShadow = receive;
    }
  });
}

function makeGlowMat(hex, extra) {
  var opts = {
    color: hex,
    emissive: hex,
    emissiveIntensity: 0.06,
    roughness: 0.3,
    metalness: 0.2
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      opts[k] = extra[k];
    });
  }
  return new THREE.MeshStandardMaterial(opts);
}

function createSouvenirModel(id, matFactory) {
  var gm = matFactory || makeGlowMat;
  if (id === "crown-5") {
    var gc = new THREE.Group();
    var cushion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.32, 0.09, 4, 1),
      new THREE.MeshStandardMaterial({ color: 0xc2185b, roughness: 0.85 })
    );
    cushion.rotation.y = Math.PI * 0.25;
    cushion.position.y = 0.045;
    var tasselMat = new THREE.MeshStandardMaterial({ color: 0xf6c453, roughness: 0.4, metalness: 0.5 });
    for (var tq = 0; tq < 4; tq += 1) {
      var ta = (tq / 4) * Math.PI * 2;
      var tassel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), tasselMat);
      tassel.position.set(Math.cos(ta) * 0.31, 0.03, Math.sin(ta) * 0.31);
      gc.add(tassel);
    }
    var crown = makeMiniCrown3D(gm(0xffbe0b, { metalness: 0.78, roughness: 0.22 }));
    crown.scale.setScalar(1.25);
    crown.position.y = 0.16;
    gc.add(cushion, crown);
    return gc;
  }
  if (id === "rainbow-balloons") {
    var gb = new THREE.Group();
    var cols = [0xff5d8f, 0xffbe0b, 0x4cc9f0];
    var offs = [[-0.12, 0.5, 0], [0.12, 0.54, 0.02], [0, 0.66, -0.06]];
    var strMat = new THREE.MeshStandardMaterial({ color: 0xfff5e0, roughness: 0.8 });
    for (var i = 0; i < 3; i += 1) {
      var orb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), gm(cols[i], { roughness: 0.18, metalness: 0.05 }));
      orb.scale.y = 1.2;
      orb.position.set(offs[i][0], offs[i][1], offs[i][2]);
      var str = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(offs[i][0], offs[i][1] - 0.18, offs[i][2]), new THREE.Vector3(0, 0.08, 0)), 1, 0.006, 4, false),
        strMat
      );
      gb.add(orb, str);
    }
    var bow = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12), gm(0xff70a6));
    bow.position.y = 0.08;
    var weight = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 14), gm(0xf4a261));
    weight.position.y = 0.035;
    gb.add(bow, weight);
    return gb;
  }
  if (id === "paw-musicbox") {
    var gmBox = new THREE.Group();
    var woodBox = gm(0x8d5a3b, { roughness: 0.5, metalness: 0.05 });
    var gold = gm(0xf2c14e, { roughness: 0.25, metalness: 0.8 });
    var pawBlue = gm(0x3a86ff, { roughness: 0.3 });
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.3), woodBox);
    box.position.y = 0.12;
    var trim = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.025, 0.31), gold);
    trim.position.y = 0.2;
    var lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.24, -0.15);
    lidPivot.rotation.x = -0.5;
    var lid = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.32), woodBox);
    lid.position.set(0, 0.025, 0.16);
    lidPivot.add(lid);
    var medal = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 20), gold);
    medal.rotation.x = Math.PI * 0.5;
    medal.position.set(0, 0.12, 0.155);
    var pad = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), pawBlue);
    pad.scale.set(1.15, 0.95, 0.4);
    pad.position.set(0, 0.105, 0.17);
    gmBox.add(box, trim, lidPivot, medal, pad);
    for (var t = 0; t < 4; t += 1) {
      var toe = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), pawBlue);
      toe.scale.set(1, 1, 0.5);
      toe.position.set(-0.039 + t * 0.026, 0.15 + (t === 1 || t === 2 ? 0.01 : 0), 0.17);
      gmBox.add(toe);
    }
    var crank = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), gold);
    crank.rotation.z = Math.PI * 0.5;
    crank.position.set(0.25, 0.13, 0);
    var knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), gold);
    knob.position.set(0.29, 0.17, 0);
    gmBox.add(crank, knob);
    return gmBox;
  }
  var gt = new THREE.Group();
  var colsL = [0x2ec4b6, 0xff70a6, 0xffd60a];
  for (var lv = 0; lv < 3; lv += 1) {
    var m = gm(colsL[lv], { roughness: 0.3, metalness: 0.02 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.3 - lv * 0.04, 0.13, 0.22 - lv * 0.02), m);
    body.position.set(lv === 1 ? 0.02 : 0, 0.065 + lv * 0.13, 0);
    body.rotation.y = lv * 0.18;
    gt.add(body);
    for (var sx = -1; sx <= 1; sx += 2) {
      for (var sz = -1; sz <= 1; sz += 2) {
        var stud = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 10), m);
        stud.position.set(sx * 0.06, 0.145 + lv * 0.13, sz * 0.045);
        if (lv === 2) {
          gt.add(stud);
        }
      }
    }
  }
  var stick = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0xfffaf0 }));
  stick.position.y = 0.47;
  var candy = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.022, 8, 20), gm(0xff4d6d, { roughness: 0.2 }));
  candy.position.y = 0.58;
  var candyCore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 14), gm(0xfff1f5));
  candyCore.rotation.x = Math.PI * 0.5;
  candyCore.position.y = 0.58;
  gt.add(stick, candy, candyCore);
  return gt;
}

function buildNurseryDeskAndShelf(scene) {
  var woodTex = makeWoodTexture();
  var deskMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    color: 0xf4dcc0,
    roughness: 0.72,
    metalness: 0.02
  });
  var deskMesh = new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, 15), deskMat);
  deskMesh.position.set(0, -0.3, 0);
  deskMesh.receiveShadow = true;
  scene.add(deskMesh);

  // 简洁柔和背景墙与踢脚线
  engine.dayWallTex = makeWallpaperTexture(false);
  engine.nightWallTex = makeWallpaperTexture(true);
  var wallMat = new THREE.MeshStandardMaterial({ map: engine.dayWallTex, roughness: 0.94 });
  var wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(32, 13), wallMat);
  wallMesh.position.set(0, 4.6, -5.0);
  wallMesh.receiveShadow = true;
  engine.wallMesh = wallMesh;
  scene.add(wallMesh);

  var molding = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.24, 0.2),
    new THREE.MeshStandardMaterial({ map: woodTex, color: 0xcf9b6c, roughness: 0.65 })
  );
  molding.position.set(0, 0.12, -4.9);
  molding.receiveShadow = true;
  scene.add(molding);

  // 极淡的远侧边角台灯（主要提供暖光照明层次，不抢书本焦点）
  var lampG = new THREE.Group();
  lampG.position.set(-6.4, 0, -3.2);
  lampG.scale.setScalar(0.68);
  var walnutMat = new THREE.MeshStandardMaterial({ color: 0x6f4324, roughness: 0.42, metalness: 0.08 });
  var brassMat = new THREE.MeshStandardMaterial({ color: 0xd9a84e, roughness: 0.26, metalness: 0.82 });
  var shadeMat = new THREE.MeshStandardMaterial({
    map: makePleatedShadeTexture(),
    emissive: new THREE.Color(0xffc766),
    emissiveIntensity: 0.68,
    roughness: 0.65,
    side: THREE.DoubleSide
  });
  engine.lampShadeMat = shadeMat;
  var bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4 });
  engine.lampBulbMat = bulbMat;

  var lBase = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.74, 0.18, 28), walnutMat);
  lBase.position.y = 0.09;
  var lPole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.8, 16), brassMat);
  lPole.position.y = 1.12;
  var lShade = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.98, 1.12, 32, 1, true), shadeMat);
  lShade.position.y = 2.3;
  var lBulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), bulbMat);
  lBulb.position.y = 2.06;
  var lampLight = new THREE.PointLight(0xffcb70, 5.4, 22, 1.35);
  lampLight.position.set(1.8, 3.2, 2.2);
  engine.lampLight = lampLight;
  lampG.add(lBase, lPole, lShade, lBulb, lampLight);
  shadowAll(lampG, true, true);
  lBulb.castShadow = false;
  lShade.castShadow = false;
  scene.add(lampG);

  // 4 件微缩纪念宝物轻巧点缀于书后远侧桌面，不抢主书阅读焦点
  var souvenirIds = [
    { id: "crown-5", x: -2.2 },
    { id: "rainbow-balloons", x: -0.75 },
    { id: "paw-musicbox", x: 0.75 },
    { id: "lego-candy-tower", x: 2.2 }
  ];
  for (var di = 0; di < souvenirIds.length; di += 1) {
    var def = souvenirIds[di];
    var grp = createSouvenirModel(def.id, makeGlowMat);
    grp.scale.setScalar(0.58);
    grp.position.set(def.x, 0.02, -3.18);
    var mats = [];
    grp.traverse(function (ch) {
      if (ch.isMesh) {
        ch.castShadow = true;
        if (ch.material && ch.material.emissive && mats.indexOf(ch.material) < 0) {
          mats.push(ch.material);
        }
      }
    });
    scene.add(grp);
    engine.souvenirs[def.id] = { group: grp, baseY: 0.02, phase: di * 1.1, mats: mats, lastGlow: -1 };
  }

  // 书本附近的轻柔微尘粒子（收敛数量与分布）
  var count = 36;
  var positions = new Float32Array(count * 3);
  for (var f = 0; f < count; f += 1) {
    positions[f * 3] = (Math.random() - 0.5) * 9.2;
    positions[f * 3 + 1] = 0.4 + Math.random() * 2.8;
    positions[f * 3 + 2] = -2.6 + Math.random() * 5.0;
  }
  var dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  var dustMat = new THREE.PointsMaterial({
    map: makeDustSpriteTexture(),
    size: 0.11,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  var pts = new THREE.Points(dustGeo, dustMat);
  engine.dustPoints = pts;
  engine.dustMat = dustMat;
  scene.add(pts);
}

/* ======================== 平铺实体精装书与翻页片构建 ======================== */

function buildHardcoverBookBase(scene) {
  var bookRoot = new THREE.Group();
  engine.bookRoot = bookRoot;
  scene.add(bookRoot);

  engine.creamPaperTex = makeCreamPaperBaseTexture();
  var backCoverMat = new THREE.MeshStandardMaterial({
    map: makeStarryCoverTexture(),
    roughness: 0.62,
    metalness: 0.08
  });
  var coverEdgeMat = new THREE.MeshStandardMaterial({ color: 0x222c62, roughness: 0.5, metalness: 0.18 });
  var innerEndpaperMat = new THREE.MeshStandardMaterial({
    map: makeStarryCoverTexture(),
    color: 0xf7e7ca,
    roughness: 0.78,
    metalness: 0.04
  });
  var frontCoverMat = new THREE.MeshStandardMaterial({
    map: makeFrontCoverTexture(),
    roughness: 0.52,
    metalness: 0.08
  });
  engine.frontCoverMat = frontCoverMat;

  var halfCoverW = HALF_W + 0.17;
  var fullCoverD = BOOK_D + 0.28;

  // 右半固定底壳（开合都承托页叠，左侧留给真·铰链翻开的前封面）
  var backCoverMesh = new THREE.Mesh(new THREE.BoxGeometry(halfCoverW, COVER_H, fullCoverD), backCoverMat);
  backCoverMesh.position.set(halfCoverW * 0.5, COVER_H * 0.5, 0);
  backCoverMesh.castShadow = true;
  backCoverMesh.receiveShadow = true;
  bookRoot.add(backCoverMesh);

  // 可展开/竖立中央书脊板：合书时包覆整本左侧脊柱，开书时扁平嵌入书底中央
  var spineH = PAGE_TOP_Y + COVER_H;
  var spineMat = new THREE.MeshStandardMaterial({ color: 0x1d2658, roughness: 0.48, metalness: 0.22 });
  var spineGoldMat = new THREE.MeshStandardMaterial({ color: 0xe9bc5a, roughness: 0.28, metalness: 0.78 });
  var spineBackMesh = new THREE.Group();
  var spineBody = new THREE.Mesh(new THREE.BoxGeometry(0.11, spineH, fullCoverD), spineMat);
  var spineRib1 = new THREE.Mesh(new THREE.BoxGeometry(0.118, spineH * 0.08, fullCoverD + 0.01), spineGoldMat);
  spineRib1.position.y = spineH * 0.36;
  var spineRib2 = spineRib1.clone();
  spineRib2.position.y = -spineH * 0.36;
  spineBackMesh.add(spineBody, spineRib1, spineRib2);
  spineBackMesh.position.set(-0.045, spineH * 0.5, 0);
  shadowAll(spineBackMesh, true, true);
  engine.spineBackMesh = spineBackMesh;
  bookRoot.add(spineBackMesh);

  // 真·铰链前封面（左铰链位于 x=0；rotation.z: 0 合上 -> Math.PI 摊平为左封底）
  var frontCoverPivot = new THREE.Group();
  frontCoverPivot.position.set(0, PAGE_TOP_Y, 0);
  var frontCoverMesh = new THREE.Mesh(
    new THREE.BoxGeometry(halfCoverW, COVER_H, fullCoverD),
    [coverEdgeMat, spineMat, frontCoverMat, innerEndpaperMat, coverEdgeMat, coverEdgeMat]
  );
  frontCoverMesh.position.set(halfCoverW * 0.5, COVER_H * 0.5, 0);
  frontCoverMesh.castShadow = true;
  frontCoverMesh.receiveShadow = true;
  frontCoverPivot.add(frontCoverMesh);

  // 封面正面 3D 浮雕金角 + 顶部 3D 小皇冠徽章（过半角自动隐藏防穿桌面）
  var frontCoverFrontGroup = new THREE.Group();
  frontCoverFrontGroup.position.set(0, COVER_H + 0.004, 0);
  var cornerBrassGeo = new THREE.BoxGeometry(0.24, 0.014, 0.24);
  var cornerCoords = [
    [halfCoverW - 0.14, -fullCoverD * 0.5 + 0.14],
    [halfCoverW - 0.14, fullCoverD * 0.5 - 0.14],
    [0.24, -fullCoverD * 0.5 + 0.14],
    [0.24, fullCoverD * 0.5 - 0.14]
  ];
  for (var cc = 0; cc < cornerCoords.length; cc += 1) {
    var cm = new THREE.Mesh(cornerBrassGeo, spineGoldMat);
    cm.position.set(cornerCoords[cc][0], 0.004, cornerCoords[cc][1]);
    cm.castShadow = true;
    frontCoverFrontGroup.add(cm);
  }
  var coverCrown = makeMiniCrown3D();
  coverCrown.scale.setScalar(0.88);
  coverCrown.position.set(halfCoverW * 0.525, 0.055, -1.88);
  coverCrown.rotation.x = 0.14;
  frontCoverFrontGroup.add(coverCrown);
  frontCoverPivot.add(frontCoverFrontGroup);

  var frontCoverHitMesh = makeHitMesh(new THREE.BoxGeometry(halfCoverW + 0.22, COVER_H + 0.26, fullCoverD + 0.26));
  frontCoverHitMesh.position.set(halfCoverW * 0.5, COVER_H * 0.5, 0);
  frontCoverHitMesh.userData.interact = { kind: "open-book", id: "book-front-cover", label: "翻开 KIKI 的5岁生日立体书" };
  frontCoverPivot.add(frontCoverHitMesh);

  engine.frontCoverPivot = frontCoverPivot;
  engine.frontCoverMesh = frontCoverMesh;
  engine.frontCoverFrontGroup = frontCoverFrontGroup;
  engine.frontCoverHitMesh = frontCoverHitMesh;
  bookRoot.add(frontCoverPivot);

  var ribbonMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.014, 0.66),
    new THREE.MeshStandardMaterial({ color: 0xef3e7a, roughness: 0.5 })
  );
  ribbonMesh.position.set(1.65, 0.015, BOOK_D * 0.5 + 0.22);
  ribbonMesh.rotation.y = -0.08;
  ribbonMesh.castShadow = true;
  bookRoot.add(ribbonMesh);

  // 左、右奶油页叠厚度块
  var edgeMat = new THREE.MeshStandardMaterial({ map: makePageEdgeTexture(), roughness: 0.8 });
  var stackTopMat = new THREE.MeshStandardMaterial({ color: 0xfaf2de, roughness: 0.85 });
  var stackMaterials = [edgeMat, edgeMat, stackTopMat, edgeMat, edgeMat, edgeMat];

  var leftStack = new THREE.Mesh(new THREE.BoxGeometry(HALF_W - 0.04, 1, BOOK_D - 0.04), stackMaterials);
  leftStack.position.set(-HALF_W * 0.5, COVER_H, 0);
  leftStack.castShadow = true;
  leftStack.receiveShadow = true;
  var rightStack = new THREE.Mesh(new THREE.BoxGeometry(HALF_W - 0.04, 1, BOOK_D - 0.04), stackMaterials);
  rightStack.position.set(HALF_W * 0.5, COVER_H, 0);
  rightStack.castShadow = true;
  rightStack.receiveShadow = true;
  engine.leftStackMesh = leftStack;
  engine.rightStackMesh = rightStack;
  bookRoot.add(leftStack, rightStack);

  // 水平摊开左右双页顶面（接住真实站立阴影，并支持点击书页让人物走过去）
  var leftFloorMat = new THREE.MeshStandardMaterial({ map: engine.creamPaperTex, roughness: 0.9, metalness: 0.01 });
  var rightFloorMat = new THREE.MeshStandardMaterial({ map: engine.creamPaperTex, roughness: 0.9, metalness: 0.01 });
  engine.leftFloorMat = leftFloorMat;
  engine.rightFloorMat = rightFloorMat;

  function makeFloorGeo(isLeft) {
    var geo = new THREE.PlaneGeometry(HALF_W - 0.01, BOOK_D - 0.06, 16, 4);
    geo.rotateX(-Math.PI * 0.5);
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i += 1) {
      var worldX = pos.getX(i) + (isLeft ? -HALF_W * 0.5 : HALF_W * 0.5);
      pos.setY(i, pageSurfaceY(worldX));
    }
    geo.computeVertexNormals();
    return geo;
  }
  var leftFloorMesh = new THREE.Mesh(makeFloorGeo(true), leftFloorMat);
  leftFloorMesh.position.set(-HALF_W * 0.5, PAGE_TOP_Y, 0);
  leftFloorMesh.receiveShadow = true;
  leftFloorMesh.userData.interact = { kind: "walk-floor", id: "book-floor-left", label: "点草地走过去" };
  var rightFloorMesh = new THREE.Mesh(makeFloorGeo(false), rightFloorMat);
  rightFloorMesh.position.set(HALF_W * 0.5, PAGE_TOP_Y, 0);
  rightFloorMesh.receiveShadow = true;
  rightFloorMesh.userData.interact = { kind: "walk-floor", id: "book-floor-right", label: "点草地走过去" };
  engine.leftFloorMesh = leftFloorMesh;
  engine.rightFloorMesh = rightFloorMesh;
  bookRoot.add(leftFloorMesh, rightFloorMesh);

  // 点击书页地面时绽放的金粉色波纹环
  var walkRingGeo = new THREE.RingGeometry(0.11, 0.21, 28);
  walkRingGeo.rotateX(-Math.PI * 0.5);
  var walkRingMat = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  var walkRingMesh = new THREE.Mesh(walkRingGeo, walkRingMat);
  walkRingMesh.position.set(0, PAGE_TOP_Y + 0.012, 0);
  walkRingMesh.visible = false;
  walkRingMesh.renderOrder = 4;
  engine.walkRingMesh = walkRingMesh;
  bookRoot.add(walkRingMesh);

  // 书脊共铰链 V 形后墙：两片卡纸以 x=0 为同一铰链，内缘精确相接形成自然折痕（无白缝）
  var cardEdgeMat = new THREE.MeshStandardMaterial({ color: 0xf3e6cc, roughness: 0.82 });
  var wallLeftMat = new THREE.MeshStandardMaterial({ map: engine.creamPaperTex, roughness: 0.86 });
  var wallRightMat = new THREE.MeshStandardMaterial({ map: engine.creamPaperTex, roughness: 0.86 });
  var wallBackMat = new THREE.MeshStandardMaterial({ map: engine.creamPaperTex, color: 0xf1e4c8, roughness: 0.9 });
  engine.leftWallMat = wallLeftMat;
  engine.rightWallMat = wallRightMat;

  var wallW = HALF_W - 0.02;
  var wallGeoL = new THREE.BoxGeometry(wallW, WALL_H, WALL_T);
  wallGeoL.translate(-wallW * 0.5, WALL_H * 0.5, 0);
  var wallGeoR = new THREE.BoxGeometry(wallW, WALL_H, WALL_T);
  wallGeoR.translate(wallW * 0.5, WALL_H * 0.5, 0);

  var leftWallPivot = new THREE.Group();
  leftWallPivot.position.set(0, PAGE_TOP_Y, WALL_Z);
  var leftWallMesh = new THREE.Mesh(wallGeoL, [cardEdgeMat, cardEdgeMat, cardEdgeMat, cardEdgeMat, wallLeftMat, wallBackMat]);
  leftWallMesh.castShadow = true;
  leftWallMesh.receiveShadow = true;
  leftWallMesh.userData.wallSide = "left";
  leftWallPivot.add(leftWallMesh);

  var rightWallPivot = new THREE.Group();
  rightWallPivot.position.set(0, PAGE_TOP_Y, WALL_Z);
  var rightWallMesh = new THREE.Mesh(wallGeoR, [cardEdgeMat, cardEdgeMat, cardEdgeMat, cardEdgeMat, wallRightMat, wallBackMat]);
  rightWallMesh.castShadow = true;
  rightWallMesh.receiveShadow = true;
  rightWallMesh.userData.wallSide = "right";
  rightWallPivot.add(rightWallMesh);

  engine.leftWallPivot = leftWallPivot;
  engine.rightWallPivot = rightWallPivot;
  engine.leftWallMesh = leftWallMesh;
  engine.rightWallMesh = rightWallMesh;
  bookRoot.add(leftWallPivot, rightWallPivot);
  applyWallFold(0);

  // 真 3D 弧形弯页网格（翻页过渡用，平常隐藏；整体抬高 TURN_LIFT 防 Z-fighting）
  var segX = 36;
  var segZ = 12;
  var turnGeo = new THREE.PlaneGeometry(HALF_W - 0.06, BOOK_D - 0.08, segX, segZ);
  turnGeo.rotateX(-Math.PI * 0.5);
  var tPos = turnGeo.attributes.position;
  var baseArr = new Float32Array(tPos.count * 2);
  var halfShiftX = (HALF_W - 0.06) * 0.5;
  for (var ti = 0; ti < tPos.count; ti += 1) {
    var px = tPos.getX(ti) + halfShiftX;
    var pz = tPos.getZ(ti);
    tPos.setXYZ(ti, px, 0, pz);
    baseArr[ti * 2] = px;
    baseArr[ti * 2 + 1] = pz;
  }
  turnGeo.computeVertexNormals();

  var turnPivot = new THREE.Group();
  turnPivot.position.set(0, PAGE_TOP_Y + TURN_LIFT, 0);
  turnPivot.visible = false;
  var turnFrontMat = new THREE.MeshStandardMaterial({ map: engine.creamPaperTex, roughness: 0.82, side: THREE.FrontSide });
  var turnBackMat = new THREE.MeshStandardMaterial({ map: engine.creamPaperTex, roughness: 0.85, side: THREE.BackSide });
  var turnFrontMesh = new THREE.Mesh(turnGeo, turnFrontMat);
  turnFrontMesh.castShadow = true;
  var turnBackMesh = new THREE.Mesh(turnGeo, turnBackMat);
  turnPivot.add(turnFrontMesh, turnBackMesh);

  engine.turnPivot = turnPivot;
  engine.turnMesh = turnFrontMesh;
  engine.turnGeo = turnGeo;
  engine.turnBaseCoords = baseArr;
  engine.turnMat = turnFrontMat;
  engine.turnBackMat = turnBackMat;
  bookRoot.add(turnPivot);

  // 立体舞台挂载组 & 3D 粒子组
  var dioramaGroup = new THREE.Group();
  dioramaGroup.position.set(0, PAGE_TOP_Y, 0);
  bookRoot.add(dioramaGroup);
  engine.dioramaGroup = dioramaGroup;

  var particleGroup = new THREE.Group();
  particleGroup.position.set(0, PAGE_TOP_Y, 0);
  bookRoot.add(particleGroup);
  engine.particleGroup = particleGroup;
  createParticlePools();

  // 常驻的 2 盏页面点光源（盒内暖光 / 灯串 / 烛光复用）：光源数量恒定，翻页不触发全场着色器重编译
  var pageLightGroup = new THREE.Group();
  pageLightGroup.position.set(0, PAGE_TOP_Y, 0);
  bookRoot.add(pageLightGroup);
  engine.pageLights = [];
  for (var pl = 0; pl < 2; pl += 1) {
    var light = new THREE.PointLight(0xffc56b, 0, 4, 2);
    pageLightGroup.add(light);
    engine.pageLights.push({ light: light, base: 0 });
  }
  engine.pageLightMul = 1;
}

function triggerWalkRing(x, z) {
  if (!engine.walkRingMesh) {
    return;
  }
  engine.walkRingMesh.position.set(x, PAGE_TOP_Y + pageSurfaceY(x) + 0.012, z);
  engine.walkRingMesh.scale.setScalar(0.5);
  engine.walkRingMesh.material.opacity = 0.85;
  engine.walkRingMesh.visible = true;
  engine.walkRingAnim = { startTs: performance.now(), duration: 540 };
}

function applyBookOpenFactor(f) {
  var fc = clamp(f, 0, 1);
  engine.bookOpenFactor = fc;
  var e = easeInOutCubic(fc);
  var coverT = clamp(fc / 0.58, 0, 1);
  var coverE = easeInOutCubic(coverT);

  if (engine.bookRoot) {
    engine.bookRoot.position.x = -HALF_W * 0.5 * (1 - e);
  }
  if (engine.frontCoverPivot) {
    var hoverLift = engine.bookState === "closed" ? engine.coverHoverMix * 0.075 : 0;
    var rotZ = coverE * Math.PI + hoverLift;
    engine.frontCoverPivot.rotation.z = rotZ;
    engine.frontCoverPivot.position.y = PAGE_TOP_Y + (COVER_H - PAGE_TOP_Y) * coverE;
    if (engine.frontCoverFrontGroup) {
      engine.frontCoverFrontGroup.visible = rotZ < Math.PI * 0.52;
    }
  }
  if (engine.spineBackMesh) {
    var spineH = PAGE_TOP_Y + COVER_H;
    var closedY = spineH * 0.5;
    var openY = COVER_H * 0.5;
    engine.spineBackMesh.position.set(-0.045 * (1 - coverE), closedY + (openY - closedY) * coverE, 0);
    engine.spineBackMesh.scale.set(1 + 0.8 * coverE, 1 + (COVER_H / spineH - 1) * coverE, 1);
  }

  var showLeft = coverE > 0.45;
  if (engine.leftStackMesh) {
    engine.leftStackMesh.visible = showLeft;
  }
  if (engine.leftFloorMesh) {
    engine.leftFloorMesh.visible = showLeft;
  }
  if (engine.rightFloorMesh) {
    engine.rightFloorMesh.visible = coverE > 0.14;
  }
  if (!showLeft && engine.rightStackMesh) {
    var fullH = PAGE_TOP_Y - COVER_H;
    engine.rightStackMesh.scale.y = fullH;
    engine.rightStackMesh.position.y = COVER_H + fullH * 0.5;
  } else if (showLeft) {
    updateBookStackHeight(engine.currentPage);
  }

  if (engine.bookState === "opening") {
    if (fc < 0.52) {
      setCurrentDioramaFoldFactor(1);
    } else {
      setCurrentDioramaPopUpProgress((fc - 0.52) / 0.48);
    }
  } else if (engine.bookState === "closed" || engine.bookState === "closing") {
    if (engine.bookState === "closed") {
      setCurrentDioramaFoldFactor(1);
    }
  }
  updateCornerVisibility();
}

function startOpenBookTransition(onComplete) {
  if (!engine.ready) {
    return;
  }
  if (engine.bookState === "open") {
    if (typeof onComplete === "function") {
      onComplete();
    }
    return;
  }
  if (engine.bookState === "opening") {
    return;
  }
  engine.bookState = "opening";
  engine.coverHoverMix = 0;
  engine.hoveredObj = null;
  applyTheme(engine.currentPage === 8);
  if (engine.canvas) {
    engine.canvas.style.cursor = "default";
  }
  if (typeof engine.callbacks.onBookOpening === "function") {
    engine.callbacks.onBookOpening();
  }
  engine.bookOpenAnim = {
    dir: "open",
    startTs: performance.now(),
    duration: BOOK_OPEN_DURATION_MS,
    onComplete: onComplete
  };
  startLoop();
}

function startCloseBookTransition(onComplete) {
  if (!engine.ready || engine.isFlipping) {
    return;
  }
  if (engine.bookState === "closed") {
    if (typeof onComplete === "function") {
      onComplete();
    }
    return;
  }
  if (engine.bookState === "closing") {
    return;
  }
  engine.bookState = "closing";
  engine.lookCloser = false;
  engine.hoveredObj = null;
  engine.popAnim = null;
  engine.walkRingAnim = null;
  applyTheme(false);
  if (engine.walkRingMesh) {
    engine.walkRingMesh.visible = false;
  }
  for (var i = 0; i < engine.standeeList.length; i += 1) {
    engine.standeeList[i].isWalking = false;
    engine.standeeList[i].orbitBurst = null;
  }
  if (engine.canvas) {
    engine.canvas.style.cursor = "default";
  }
  engine.bookOpenAnim = {
    dir: "close",
    startTs: performance.now(),
    duration: BOOK_OPEN_DURATION_MS,
    onComplete: onComplete
  };
  startLoop();
}

function updateBookOpenAnimation(nowTs) {
  var anim = engine.bookOpenAnim;
  if (!anim) {
    return;
  }
  var p = clamp((nowTs - anim.startTs) / anim.duration, 0, 1);
  if (anim.dir === "open") {
    applyBookOpenFactor(p);
    if (p >= 1) {
      engine.bookState = "open";
      engine.bookOpenAnim = null;
      applyBookOpenFactor(1);
      setCurrentDioramaPopUpProgress(1);
      for (var i = 0; i < engine.standeeList.length; i += 1) {
        var st = engine.standeeList[i];
        st.nextWanderTs = nowTs + 900 + i * 520 + Math.random() * 1200;
      }
      if (typeof engine.callbacks.onBookOpened === "function") {
        engine.callbacks.onBookOpened();
      }
      if (typeof anim.onComplete === "function") {
        anim.onComplete();
      }
    }
  } else {
    if (p <= 0.38) {
      setCurrentDioramaFoldFactor(p / 0.38);
      applyBookOpenFactor(1);
    } else {
      setCurrentDioramaFoldFactor(1);
      applyBookOpenFactor(1 - (p - 0.38) / 0.62);
    }
    if (p >= 1) {
      engine.bookState = "closed";
      engine.bookOpenAnim = null;
      setCurrentDioramaFoldFactor(1);
      applyBookOpenFactor(0);
      if (typeof engine.callbacks.onBookClosed === "function") {
        engine.callbacks.onBookClosed();
      }
      if (typeof anim.onComplete === "function") {
        anim.onComplete();
      }
    }
  }
}

function updateBookStackHeight(pageNum) {
  if (engine.bookOpenFactor < 0.45 && engine.bookState !== "open") {
    return;
  }
  var total = (engine.storyData && engine.storyData.pages && engine.storyData.pages.length) || 8;
  var ratio = total > 1 ? (pageNum - 1) / (total - 1) : 0;
  var maxStackH = PAGE_TOP_Y - COVER_H;
  var leftH = 0.035 + ratio * (maxStackH - 0.055);
  var rightH = maxStackH - ratio * (maxStackH - 0.055);
  if (engine.leftStackMesh) {
    engine.leftStackMesh.scale.y = leftH;
    engine.leftStackMesh.position.y = COVER_H + leftH * 0.5;
  }
  if (engine.rightStackMesh) {
    engine.rightStackMesh.scale.y = rightH;
    engine.rightStackMesh.position.y = COVER_H + rightH * 0.5;
  }
  updateCornerVisibility();
}

function updateCornerVisibility() {}

function configurePageLight(idx, color, distance, decay, x, y, z, base) {
  var pl = engine.pageLights && engine.pageLights[idx];
  if (!pl) {
    return null;
  }
  pl.light.color.setHex(color);
  pl.light.distance = distance;
  pl.light.decay = decay;
  pl.light.position.set(x, y, z);
  pl.base = base;
  pl.light.intensity = base * engine.pageLightMul;
  return pl;
}

function setPageLightBase(idx, base) {
  var pl = engine.pageLights && engine.pageLights[idx];
  if (pl) {
    pl.base = base;
    pl.light.intensity = base * engine.pageLightMul;
  }
}

function applyPageLightMul(mul) {
  engine.pageLightMul = clamp(mul, 0, 1);
  if (!engine.pageLights) {
    return;
  }
  for (var i = 0; i < engine.pageLights.length; i += 1) {
    engine.pageLights[i].light.intensity = engine.pageLights[i].base * engine.pageLightMul;
  }
}

function resetPageLights() {
  if (!engine.pageLights) {
    return;
  }
  for (var i = 0; i < engine.pageLights.length; i += 1) {
    engine.pageLights[i].base = 0;
    engine.pageLights[i].light.intensity = 0;
  }
}

function updateTurningPageDeform(progress) {
  // progress: 0（平铺在右页） -> 1（翻折落到左页）
  var pos = engine.turnGeo.attributes.position;
  var base = engine.turnBaseCoords;
  var pageW = HALF_W - 0.06;
  var theta = progress * Math.PI;
  var curlLift = Math.sin(progress * Math.PI);

  for (var i = 0; i < pos.count; i += 1) {
    var x0 = base[i * 2];
    var z0 = base[i * 2 + 1];
    var u = clamp(x0 / pageW, 0, 1);
    var v = clamp((z0 + BOOK_D * 0.5) / BOOK_D, 0, 1);
    var coneAngle = theta + curlLift * Math.pow(u, 1.35) * (0.22 + 0.34 * v);
    var clampedAng = clamp(coneAngle, 0, Math.PI);
    var archH = Math.sin(u * Math.PI) * curlLift * 0.3 + v * Math.pow(u, 1.4) * curlLift * 0.18;
    pos.setXYZ(i, Math.cos(clampedAng) * x0, Math.sin(clampedAng) * x0 + archH, z0);
  }
  pos.needsUpdate = true;
  engine.turnGeo.computeVertexNormals();
}

/* ======================== 折叠 / 弹起统一调度 ======================== */

// lf: 0 = 完全立起；1 = 完全收起（向书脊后方折倒 + 沿底边收缩）；<0 = easeOutBack 回弹
function applyWallFold(lf) {
  if (!engine.leftWallPivot || !engine.rightWallPivot) {
    return;
  }
  var lfc = clamp(lf, 0, 1);
  var rx = STANDING_WALL_RAD - WALL_FOLD_BACK_RAD * lf;
  if (rx > 0.02) {
    rx = 0.02;
  }
  var sy = clamp(1 - 0.985 * lf, 0.015, 1.04);
  var ry = WALL_V_RAD * (1 - lfc);
  engine.leftWallPivot.rotation.set(rx, ry, 0);
  engine.rightWallPivot.rotation.set(rx, -ry, 0);
  engine.leftWallPivot.scale.set(1, sy, 1);
  engine.rightWallPivot.scale.set(1, sy, 1);
  var vis = lfc < 0.995;
  engine.leftWallPivot.visible = vis;
  engine.rightWallPivot.visible = vis;
}

// 注册可折叠物件：mode = lay（绕底边向前躺平并收缩）| squash（纵向压扁）| shrink（整体缩回，可下沉）| fade（接触阴影淡出）
function registerFoldable(obj, mode, opts) {
  var o = opts || {};
  var order = typeof o.order === "number" ? o.order : clamp((obj.position.x + HALF_W) / BOOK_W, 0, 1);
  var fd = {
    obj: obj,
    mode: mode,
    order: clamp(order, 0, 1),
    drop: Boolean(o.drop),
    basePos: obj.position.clone(),
    baseScale: obj.scale.clone(),
    baseRotX: obj.rotation.x,
    baseOpacity: o.baseOpacity || 1
  };
  engine.foldables.push(fd);
  return fd;
}

function applyFoldable(fd, lf) {
  var o = fd.obj;
  var lfc = clamp(lf, 0, 1);
  var bs = fd.baseScale;
  if (fd.mode === "lay") {
    o.rotation.x = fd.baseRotX + lf * (Math.PI * 0.5);
    var s = 1 - 0.94 * smoothstep(0.6, 1, lfc);
    o.scale.set(bs.x * s, bs.y * s, bs.z * s);
  } else if (fd.mode === "squash") {
    var sy = clamp(1 - 0.98 * lf, 0.02, 1.12);
    var sxz = 1 - 0.25 * lfc;
    o.scale.set(bs.x * sxz, bs.y * sy, bs.z * sxz);
  } else if (fd.mode === "fade") {
    o.userData.foldMul = 1 - lfc;
    if (o.material) {
      o.material.opacity = fd.baseOpacity * (1 - lfc);
    }
  } else {
    var s2 = clamp(1 - 0.99 * lf, 0.01, 1.12);
    o.scale.set(bs.x * s2, bs.y * s2, bs.z * s2);
    if (fd.drop) {
      o.position.y = fd.basePos.y * (1 - 0.55 * lfc);
    }
  }
}

function setCurrentDioramaFoldFactor(foldRatio) {
  var e = easeInOutCubic(clamp(foldRatio, 0, 1));
  applyWallFold(e);
  for (var i = 0; i < engine.foldables.length; i += 1) {
    applyFoldable(engine.foldables[i], e);
  }
  applyPageLightMul(1 - e);
  if (engine.dioramaGroup) {
    engine.dioramaGroup.visible = e < 0.995;
  }
}

function setCurrentDioramaPopUpProgress(popProgress, skipWalls) {
  var p = clamp(popProgress, 0, 1);
  // 后墙先立起（带轻微回弹）；若后墙已立起（翻页已结束后才加载完成）则跳过
  if (!skipWalls) {
    applyWallFold(1 - easeOutBack(clamp(p / 0.42, 0, 1)));
  }
  applyPageLightMul(smoothstep(0.3, 0.9, p));
  // 道具从左到右依次 easeOutBack 弹出
  var anyShown = false;
  for (var i = 0; i < engine.foldables.length; i += 1) {
    var fd = engine.foldables[i];
    var delay = 0.26 + fd.order * 0.34;
    var lp = clamp((p - delay) / 0.4, 0, 1);
    if (lp > 0) {
      anyShown = true;
    }
    applyFoldable(fd, fd.mode === "fade" ? 1 - lp : 1 - easeOutBack(lp));
  }
  if (engine.dioramaGroup) {
    engine.dioramaGroup.visible = anyShown || p >= 1;
  }
}

/* ======================== 立牌与 8 页专属 3D 道具构建 ======================== */

function disposeObjectTree(root) {
  root.traverse(function (ch) {
    if (ch.isMesh || ch.isSprite || ch.isLine) {
      if (ch.geometry && !(ch.geometry.userData && ch.geometry.userData.shared)) {
        ch.geometry.dispose();
      }
      var mats = Array.isArray(ch.material) ? ch.material : [ch.material];
      for (var i = 0; i < mats.length; i += 1) {
        var m = mats[i];
        if (m && !(m.userData && m.userData.shared)) {
          m.dispose();
        }
      }
    }
  });
}

function clearCurrentDiorama() {
  if (!engine.dioramaGroup) {
    return;
  }
  if (engine.p6Lights) {
    for (var gi = 0; gi < engine.p6Lights.glassOn.length; gi += 1) {
      engine.p6Lights.glassOn[gi].dispose();
    }
    engine.p6Lights.glassOff.dispose();
  }
  resetPageLights();
  while (engine.dioramaGroup.children.length > 0) {
    var ch = engine.dioramaGroup.children[0];
    engine.dioramaGroup.remove(ch);
    disposeObjectTree(ch);
  }
  engine.standees = {};
  engine.standeeList = [];
  engine.obstacles = [];
  engine.activeActorId = null;
  engine.foldables = [];
  engine.interactables = [];
  engine.hoveredObj = null;
  engine.p1Flowers = [];
  engine.p1ButterflyFocus = null;
  engine.p1EnteringGate = null;
  engine.p2Parcel = null;
  engine.p2Delivery = null;
  engine.p3Balloons = [];
  engine.p4Badges = [];
  engine.p5Bricks = [];
  engine.p5Car = null;
  engine.p6Lights = null;
  engine.p6LightWave = null;
  engine.p6TreasureStage = null;
  engine.p7Candles = [];
  engine.p7CandleLight = null;
  engine.p7Cloud = null;
  engine.p7Treats = [];
  engine.p7TeaFlames = [];
  engine.p7BlowAnim = null;
  engine.butterflies = [];
}

function registerObstacle(x, z, r) {
  engine.obstacles.push({ x: x, z: z, r: r });
}

function clampWalkTarget(x, z) {
  var minZ = -1.15;
  var maxZ = engine.currentPage === 7 ? 0.9 : 1.55;
  var tx = clamp(x, -2.75, 2.75);
  var tz = clamp(z, minZ, maxZ);
  for (var pass = 0; pass < 2; pass += 1) {
    for (var i = 0; i < engine.obstacles.length; i += 1) {
      var ob = engine.obstacles[i];
      var dx = tx - ob.x;
      var dz = tz - ob.z;
      var minR = ob.r + 0.14;
      var d2 = dx * dx + dz * dz;
      if (d2 < minR * minR) {
        var d = Math.sqrt(d2);
        if (d < 0.001) {
          tx = ob.x - (minR + 0.04);
          tz = ob.z + 0.12;
        } else {
          tx = ob.x + (dx / d) * (minR + 0.02);
          tz = ob.z + (dz / d) * (minR + 0.02);
        }
        tx = clamp(tx, -2.75, 2.75);
        tz = clamp(tz, minZ, maxZ);
      }
    }
  }
  return { x: tx, z: tz };
}

function commandActorMove(st, x, z, isUser) {
  if (!st || !st.movable) {
    return;
  }
  var pt = clampWalkTarget(x, z);
  st.targetX = pt.x;
  st.targetZ = pt.z;
  st.isWalking = true;
  st.isUserCommanded = Boolean(isUser);
  st.walkSpeed = isUser ? 1.85 : 0.58 + Math.random() * 0.24;
  st.orbitBurst = null;
}

function makeHitMesh(geo) {
  return new THREE.Mesh(geo, engine.hitMat);
}

function pushInteractable(mesh, kind, pageNum, id, label, pivot, ref) {
  mesh.userData.interact = { kind: kind, pageNum: pageNum, id: id, label: label };
  engine.interactables.push({ mesh: mesh, kind: kind, pageNum: pageNum, id: id, label: label, pivot: pivot || mesh, ref: ref || null });
}

function addContactShadow(x, z, w, d, opacity) {
  var mat = new THREE.MeshBasicMaterial({
    map: engine.contactTex,
    color: 0x2a160a,
    transparent: true,
    opacity: opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  var geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI * 0.5);
  var m = new THREE.Mesh(geo, mat);
  m.scale.set(w, 1, d);
  m.position.set(x, pageSurfaceY(x) + 0.004, z);
  m.renderOrder = 1;
  m.userData.foldMul = 1;
  engine.dioramaGroup.add(m);
  registerFoldable(m, "fade", { baseOpacity: opacity });
  return m;
}

function getKikiX(pageNum) {
  var pg = getPageData(pageNum);
  var actors = (pg && pg.actors) || [];
  for (var i = 0; i < actors.length; i += 1) {
    if (actors[i].role === "kiki") {
      return ((actors[i].x - 50) / 50) * 3.0;
    }
  }
  return null;
}

function getActor3DPlacement(pageNum, actor, idx, total) {
  // 将 0..100% 映射为书页 3D 宽度 [-3.0, +3.0]
  var x = ((actor.x - 50) / 50) * 3.0;
  var z = 0;

  if (actor.anchor === "center") {
    // 飞行角色：高空 + 靠后（贴近后墙），并与 KIKI 保持横向安全距离，绝不挡住她的脸
    var yAir = 1.98 + (1 - actor.y / 40) * 0.22;
    var kikiX = getKikiX(pageNum);
    if (kikiX !== null && Math.abs(x - kikiX) < 1.15) {
      x = kikiX + (x >= kikiX ? 1.15 : -1.15);
    }
    x = clamp(x, -2.75, 2.75);
    z = -1.0 + (idx % 2) * 0.22;
    return { x: x, y: yAir, z: z, isAir: true };
  }

  if (actor.role === "castle") {
    z = -1.06;
  } else if (actor.role === "flag") {
    x = clamp(x + 0.14, -2.75, 2.75);
    z = -1.03;
  } else if (actor.role === "cake") {
    z = -0.45;
  } else if (actor.role === "kiki") {
    z = pageNum === 1 ? 0.5 : 0.8;
  } else if (actor.role === "parcel") {
    z = 0.42;
  } else if (total >= 8) {
    // 群像页：前后两排错落站立，后排略高于地平线、前排靠近读者
    z = idx % 2 === 0 ? -0.72 : 0.3;
  } else {
    z = -0.25 + ((idx % 3) - 1) * 0.42;
  }

  var baseY = 0;
  if (pageNum === 5 && actor.role === "flag") {
    baseY = 1.76;
  }
  return { x: x, y: baseY, z: z, isAir: false };
}

function makeMiniCrown3D(customMat) {
  var g = new THREE.Group();
  var mat = customMat || new THREE.MeshStandardMaterial({
    color: 0xffc61a,
    emissive: 0xffa800,
    emissiveIntensity: 0.22,
    metalness: 0.78,
    roughness: 0.22
  });
  var pearlMat = new THREE.MeshStandardMaterial({ color: 0xfff6ea, roughness: 0.25, metalness: 0.1, emissive: 0xfff0d8, emissiveIntensity: 0.12 });
  var gemPink = new THREE.MeshStandardMaterial({ color: 0xff4d8d, emissive: 0xff4d8d, emissiveIntensity: 0.4, roughness: 0.15, metalness: 0.2 });
  var gemBlue = new THREE.MeshStandardMaterial({ color: 0x5ec8ff, emissive: 0x3aa8ff, emissiveIntensity: 0.35, roughness: 0.15 });

  var band = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.085, 28, 1, true), mat);
  band.material.side = THREE.DoubleSide;
  var rimTop = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.011, 6, 28), mat);
  rimTop.rotation.x = Math.PI * 0.5;
  rimTop.position.y = 0.043;
  var rimBot = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 28), mat);
  rimBot.rotation.x = Math.PI * 0.5;
  rimBot.position.y = -0.043;
  g.add(band, rimTop, rimBot);
  for (var i = 0; i < 5; i += 1) {
    var a = (i / 5) * Math.PI * 2 + Math.PI * 0.5;
    var tall = i === 0 ? 0.13 : 0.1;
    var cone = new THREE.Mesh(new THREE.ConeGeometry(0.036, tall, 4), mat);
    cone.position.set(Math.cos(a) * 0.145, 0.043 + tall * 0.5, Math.sin(a) * 0.145);
    cone.rotation.y = -a;
    var pearl = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), pearlMat);
    pearl.position.set(Math.cos(a) * 0.145, 0.043 + tall + 0.012, Math.sin(a) * 0.145);
    g.add(cone, pearl);
    var sideGem = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), i % 2 === 0 ? gemBlue : gemPink);
    var b = a + Math.PI / 5;
    sideGem.position.set(Math.cos(b) * 0.152, 0, Math.sin(b) * 0.152);
    g.add(sideGem);
  }
  var gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), gemPink);
  gem.scale.set(1, 1.25, 0.6);
  gem.position.set(0, 0.0, 0.152);
  g.add(gem);
  g.traverse(function (ch) {
    if (ch.isMesh) {
      ch.castShadow = true;
    }
  });
  return g;
}

function getCrownAnchor(isCheer) {
  var sc = (engine.storyData && engine.storyData.spriteConfig) || {};
  var a = isCheer ? sc.kikiCheerCrownAnchor : sc.kikiCrownAnchor;
  return a || (isCheer ? { xPct: 50.6, yPct: 2.3, widthPct: 35, rotateDeg: -2 } : { xPct: 54.5, yPct: 1.8, widthPct: 38, rotateDeg: -2 });
}

// 依据 sprite 内的真实发顶锚点（扣除模切留边）放置精致小皇冠
function placeKikiCrown(st, dieCut, isCheer) {
  if (!st.crownMesh || !dieCut) {
    return;
  }
  var anchor = getCrownAnchor(isCheer);
  var w = st.hWorld * dieCut.aspect;
  var u = dieCut.padFracX + (anchor.xPct / 100) * dieCut.innerFracX;
  var vTop = dieCut.padFracY + (anchor.yPct / 100) * dieCut.innerFracY;
  var crownW = (anchor.widthPct / 100) * dieCut.innerFracX * w * 0.62;
  var sc = clamp(crownW / 0.3, 0.38, 0.75);
  st.crownMesh.scale.setScalar(sc);
  st.crownBaseX = (u - 0.5) * w;
  st.crownBaseRotZ = ((anchor.rotateDeg || 0) * Math.PI) / 180;
  var dirSign = (st.facingScale || 1) >= 0 ? 1 : -1;
  st.crownMesh.position.set(st.crownBaseX * dirSign, st.hWorld * (1 - vTop) - 0.02 * sc, 0.0);
  st.crownMesh.rotation.set(0.2, 0, st.crownBaseRotZ * dirSign);
}

function addStandeeActor(pageNum, actor, idx, total, pageState, token) {
  if (pageNum === 2 && actor.id === "p2-parcel-box") {
    buildP2GiftBox(pageNum, actor, pageState);
    return Promise.resolve();
  }

  var spriteFile = actor.sprite;
  var kikiCrownWearing = false;
  var isCheer = false;
  if (actor.role === "kiki") {
    if (pageNum === 2) {
      var p2s = pageState && pageState.p2 ? pageState.p2 : {};
      kikiCrownWearing = Boolean(p2s.opened);
      if (p2s.opened) {
        spriteFile = "kiki-cheer.webp";
        isCheer = true;
      }
    } else if (actor.hasCrown) {
      kikiCrownWearing = true;
    }
  }

  return getOrLoadDieCut(spriteFile).then(function (dieCut) {
    if (token !== engine.buildToken) {
      return;
    }
    // 统一比例：以后墙 WALL_H=2.08 为基准，KIKI 与城堡突出为主角，其它伙伴按 heightPct 等比
    var hWorld = clamp((actor.heightPct / 100) * 2.5, 0.46, 1.32);
    if (actor.role === "cake") {
      hWorld = 1.28;
    } else if (actor.role === "castle") {
      hWorld = 1.98;
    } else if (actor.role === "flag") {
      hWorld = 0.5;
    } else if (actor.role === "kiki") {
      hWorld = pageNum >= 6 ? 1.16 : 1.24;
    }
    var wWorld = hWorld * dieCut.aspect;

    var placement = getActor3DPlacement(pageNum, actor, idx, total);
    var groundY = placement.isAir ? 0 : pageSurfaceY(placement.x);
    var movable = !placement.isAir && actor.role !== "cake" && actor.role !== "castle" && actor.role !== "flag" && actor.role !== "parcel";
    var root = new THREE.Group();
    root.position.set(placement.x, placement.y + groundY, placement.z);
    var pivot = new THREE.Group();
    root.add(pivot);

    var geo = new THREE.PlaneGeometry(wWorld, hWorld);
    var mat = new THREE.MeshStandardMaterial({
      map: dieCut.texture,
      alphaTest: 0.42,
      roughness: 0.72,
      metalness: 0.02,
      side: THREE.DoubleSide
    });
    var depthMat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: dieCut.texture,
      alphaTest: 0.42,
      side: THREE.DoubleSide
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, placement.isAir ? 0 : hWorld * 0.5, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.customDepthMaterial = depthMat;
    pivot.add(mesh);

    if (actor.hiddenUntil === "p5-won") {
      root.visible = Boolean(pageState && pageState.p5 && pageState.p5.won);
    }

    var st = {
      root: root,
      pivot: pivot,
      mesh: mesh,
      mat: mat,
      depthMat: depthMat,
      crownMesh: null,
      crownBaseX: 0,
      crownBaseRotZ: 0,
      contact: null,
      contactBase: 0,
      config: actor,
      pageNum: pageNum,
      hWorld: hWorld,
      wWorld: wWorld,
      baseX: placement.x,
      baseY: placement.y + groundY,
      baseZ: placement.z,
      homeX: placement.x,
      homeZ: placement.z,
      curX: placement.x,
      curZ: placement.z,
      targetX: placement.x,
      targetZ: placement.z,
      movable: movable,
      isWalking: false,
      isUserCommanded: false,
      walkSpeed: 0.72,
      walkCycle: idx * 1.4,
      facing: 1,
      prevFacing: 1,
      facingScale: 1,
      facingChangeTs: 0,
      turnAnim: null,
      baseMeshScaleX: 1,
      nextWanderTs: performance.now() + 1400 + idx * 650 + Math.random() * 1400,
      lastStepFxTs: 0,
      isAir: placement.isAir,
      actionBurst: null,
      orbitBurst: null,
      phase: idx * 0.85,
      hoverMix: 0
    };

    if (actor.role === "kiki") {
      st.crownMesh = makeMiniCrown3D();
      st.crownMesh.visible = kikiCrownWearing;
      pivot.add(st.crownMesh);
      placeKikiCrown(st, dieCut, isCheer);
    }

    if (actor.role === "castle") {
      registerObstacle(placement.x, placement.z, 0.96);
    }

    engine.dioramaGroup.add(root);
    engine.standees[actor.id] = st;
    engine.standeeList.push(st);

    if (placement.isAir) {
      registerFoldable(root, "shrink", { drop: true, order: clamp((placement.x + HALF_W) / BOOK_W * 0.6 + 0.4, 0, 1) });
    } else {
      registerFoldable(root, "lay");
      if (actor.role !== "flag") {
        var cw = actor.role === "castle" ? clamp(wWorld * 0.88, 0.28, 1.52) : clamp(wWorld * 0.82, 0.28, 1.1);
        st.contactBase = actor.role === "cake" ? 0.42 : 0.5;
        st.contact = addContactShadow(placement.x, placement.z + 0.02, cw, cw * 0.36, st.contactBase);
      }
    }

    if (actor.clickable) {
      pushInteractable(mesh, "actor", pageNum, actor.id, actor.label, pivot);
      mesh.userData.interact.actor = actor;
    }

    if (pageNum === 7 && actor.role === "cake") {
      buildP7CandlesAndCloud(st, dieCut, pageState);
      buildP7PartyTableProps(st);
    }
  });
}

/* ---------------- P1 分层花簇与水平扇翅彩蝶 ---------------- */

function makeFlowerClusterTexture(petalColorHex) {
  var W = 256;
  var H = 200;
  var tmp = document.createElement("canvas");
  tmp.width = W;
  tmp.height = H;
  var t = tmp.getContext("2d");

  // 茎与叶（渐变叶片 + 叶脉）
  t.strokeStyle = "#4f9a4c";
  t.lineWidth = 4;
  var stems = [[70, 104], [128, 70], [186, 108], [100, 120], [158, 124]];
  for (var s = 0; s < stems.length; s += 1) {
    t.beginPath();
    t.moveTo(128 + (stems[s][0] - 128) * 0.35, 188);
    t.quadraticCurveTo(stems[s][0] + 6, (stems[s][1] + 188) * 0.5, stems[s][0], stems[s][1]);
    t.stroke();
  }
  function leaf(cx, cy, len, ang) {
    t.save();
    t.translate(cx, cy);
    t.rotate(ang);
    var lg = t.createLinearGradient(0, -10, 0, 10);
    lg.addColorStop(0, "#8fd27e");
    lg.addColorStop(1, "#3f8a45");
    t.fillStyle = lg;
    t.beginPath();
    t.moveTo(0, 0);
    t.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
    t.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
    t.fill();
    t.strokeStyle = "rgba(255,255,255,0.35)";
    t.lineWidth = 1.5;
    t.beginPath();
    t.moveTo(2, 0);
    t.lineTo(len * 0.9, 0);
    t.stroke();
    t.restore();
  }
  leaf(124, 186, 70, -2.6);
  leaf(132, 186, 72, -0.5);
  leaf(118, 176, 56, -2.1);
  leaf(140, 176, 58, -1.0);
  leaf(128, 190, 52, -1.57);

  function blossom(cx, cy, r) {
    var g = t.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.2);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, petalColorHex);
    g.addColorStop(1, petalColorHex);
    for (var k = 0; k < 6; k += 1) {
      var a = (k / 6) * Math.PI * 2 - Math.PI * 0.5;
      t.fillStyle = g;
      t.beginPath();
      t.ellipse(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r * 0.55, r * 0.38, a, 0, Math.PI * 2);
      t.fill();
    }
    t.fillStyle = "rgba(255,255,255,0.45)";
    for (var k2 = 0; k2 < 6; k2 += 1) {
      var a2 = (k2 / 6) * Math.PI * 2 - Math.PI * 0.5 + 0.5;
      t.beginPath();
      t.ellipse(cx + Math.cos(a2) * r * 0.32, cy + Math.sin(a2) * r * 0.32, r * 0.24, r * 0.15, a2, 0, Math.PI * 2);
      t.fill();
    }
    var cg = t.createRadialGradient(cx - r * 0.08, cy - r * 0.08, 1, cx, cy, r * 0.32);
    cg.addColorStop(0, "#fff3b0");
    cg.addColorStop(1, "#f4a62a");
    t.fillStyle = cg;
    t.beginPath();
    t.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
    t.fill();
    t.fillStyle = "rgba(160, 90, 20, 0.55)";
    for (var d = 0; d < 7; d += 1) {
      var da = (d / 7) * Math.PI * 2;
      t.beginPath();
      t.arc(cx + Math.cos(da) * r * 0.16, cy + Math.sin(da) * r * 0.16, 1.4, 0, Math.PI * 2);
      t.fill();
    }
  }
  blossom(70, 100, 28);
  blossom(186, 104, 26);
  blossom(128, 66, 34);
  blossom(100, 128, 18);
  blossom(158, 132, 18);

  // 4px 暖白模切边
  var sil = document.createElement("canvas");
  sil.width = W;
  sil.height = H;
  var sctx = sil.getContext("2d");
  sctx.drawImage(tmp, 0, 0);
  sctx.globalCompositeOperation = "source-in";
  sctx.fillStyle = "#fffaf0";
  sctx.fillRect(0, 0, W, H);
  var c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  var ctx = c.getContext("2d");
  for (var st = 0; st < 16; st += 1) {
    var ang = (st / 16) * Math.PI * 2;
    ctx.drawImage(sil, Math.cos(ang) * 4, Math.sin(ang) * 4);
  }
  ctx.drawImage(tmp, 0, 0);
  return canvasTex(c);
}

function makeButterflyWingTexture(wingHex) {
  // 右侧单翅（u=0 为身体铰链）；上方大翅、下方小翅，渐变 + 深色翅缘 + 白色斑点
  var c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  var ctx = c.getContext("2d");
  function wing(cx, cy, rx, ry, rot) {
    var g = ctx.createRadialGradient(8, 64, 4, cx, cy, Math.max(rx, ry) * 1.2);
    g.addColorStop(0, "#fff6e8");
    g.addColorStop(0.45, wingHex);
    g.addColorStop(1, wingHex);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(60, 30, 50, 0.55)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  wing(56, 40, 52, 34, -0.42);
  wing(44, 92, 36, 26, 0.38);
  ctx.fillStyle = "rgba(255, 252, 240, 0.85)";
  ctx.beginPath();
  ctx.arc(84, 30, 6, 0, Math.PI * 2);
  ctx.arc(66, 52, 4, 0, Math.PI * 2);
  ctx.arc(56, 98, 4.5, 0, Math.PI * 2);
  ctx.fill();
  return canvasTex(c);
}

function buildP1Decorations() {
  var spots = [
    { x: -2.55, z: 0.95, hex: "#ff70a6", w: 0.66 },
    { x: -1.75, z: 1.25, hex: "#ffbe0b", w: 0.56 },
    { x: -1.05, z: 0.55, hex: "#c084fc", w: 0.46 },
    { x: 1.45, z: 1.2, hex: "#9b5de5", w: 0.6 },
    { x: 2.2, z: 0.85, hex: "#4ea8de", w: 0.64 },
    { x: 2.75, z: 1.4, hex: "#fb7185", w: 0.5 }
  ];
  for (var i = 0; i < spots.length; i += 1) {
    var sp = spots[i];
    var flTex = getPropTexture("flower-" + sp.hex, function () {
      return makeFlowerClusterTexture(sp.hex);
    });
    var h = sp.w * (200 / 256);
    var flMat = new THREE.MeshStandardMaterial({ map: flTex, alphaTest: 0.4, roughness: 0.72, side: THREE.DoubleSide });
    var flDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: flTex, alphaTest: 0.4, side: THREE.DoubleSide });
    var root = new THREE.Group();
    root.position.set(sp.x, pageSurfaceY(sp.x), sp.z);
    root.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.12;
    var sway = new THREE.Group();
    root.add(sway);
    var flMesh = new THREE.Mesh(new THREE.PlaneGeometry(sp.w, h), flMat);
    flMesh.position.y = h * 0.5 - 0.01;
    flMesh.castShadow = true;
    flMesh.customDepthMaterial = flDepth;
    var flHit = makeHitMesh(new THREE.CylinderGeometry(sp.w * 0.42, sp.w * 0.42, h * 0.95, 8));
    flHit.position.y = h * 0.48;
    sway.add(flMesh, flHit);
    engine.dioramaGroup.add(root);
    registerFoldable(root, "lay");
    registerObstacle(sp.x, sp.z, 0.34);
    addContactShadow(sp.x, sp.z + 0.02, sp.w * 0.8, sp.w * 0.24, 0.42);
    var flObj = { sway: sway, root: root, x: sp.x, z: sp.z, phase: i * 0.9, bounceUntil: 0 };
    engine.p1Flowers.push(flObj);
    pushInteractable(flHit, "p1-flower", 1, "p1-flower-" + i, "神奇魔法花丛", root, flObj);
  }

  // 后墙魔法花拱门透明热区
  var archHit = makeHitMesh(new THREE.PlaneGeometry(1.85, 1.75));
  archHit.position.set(0.6, 1.05, -1.85);
  engine.dioramaGroup.add(archHit);
  pushInteractable(archHit, "start-adventure", 1, "p1-arch-gate", "魔法花拱门", archHit);

  // 5 只水平扇翅彩蝶（翅面水平朝向镜头上方，真实绕身体轴拍打）
  var bColors = ["#ff70a6", "#ffbe0b", "#38bdf8", "#c084fc", "#fb7185"];
  var bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b2a33, roughness: 0.6 });
  var wingGeoR = new THREE.PlaneGeometry(0.17, 0.17);
  wingGeoR.translate(0.085, 0, 0);
  wingGeoR.rotateX(-Math.PI * 0.5);
  var wingGeoL = wingGeoR.clone();
  wingGeoL.scale(-1, 1, 1);
  var bodyGeo = new THREE.CapsuleGeometry(0.011, 0.07, 4, 8);
  bodyGeo.rotateX(Math.PI * 0.5);
  var antGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 0.06, 4);
  for (var b = 0; b < 5; b += 1) {
    var wTex = getPropTexture("wing-" + bColors[b], (function (hex) {
      return function () {
        return makeButterflyWingTexture(hex);
      };
    })(bColors[b]));
    var wMat = new THREE.MeshStandardMaterial({ map: wTex, alphaTest: 0.4, roughness: 0.45, side: THREE.DoubleSide });
    var wDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: wTex, alphaTest: 0.4, side: THREE.DoubleSide });
    var bfBx = (b - 2) * 1.15;
    var bfBy = 0.95 + (b % 3) * 0.3;
    var bfBz = -0.45 + (b % 2) * 0.95;
    var bRoot = new THREE.Group();
    bRoot.position.set(bfBx, bfBy, bfBz);
    var bInner = new THREE.Group();
    bRoot.add(bInner);
    var rw = new THREE.Mesh(wingGeoR, wMat);
    var lw = new THREE.Mesh(wingGeoL, wMat);
    rw.castShadow = true;
    lw.castShadow = true;
    rw.customDepthMaterial = wDepth;
    lw.customDepthMaterial = wDepth;
    var body = new THREE.Mesh(bodyGeo, bodyMat);
    var antL = new THREE.Mesh(antGeo, bodyMat);
    antL.position.set(-0.012, 0.012, -0.065);
    antL.rotation.set(-1.0, 0, 0.35);
    var antR = antL.clone();
    antR.position.x = 0.012;
    antR.rotation.z = -0.35;
    bInner.add(rw, lw, body, antL, antR);
    engine.dioramaGroup.add(bRoot);
    registerFoldable(bRoot, "shrink", { order: 0.5 + b * 0.1 });
    engine.butterflies.push({
      root: bRoot,
      inner: bInner,
      lw: lw,
      rw: rw,
      phase: b * 1.3,
      baseX: bfBx,
      baseY: bfBy,
      baseZ: bfBz,
      curOffX: 0,
      curOffY: 0,
      curOffZ: 0,
      lastX: 0,
      lastZ: 0
    });
  }
}

/* ---------------- P2 中空礼物盒（真实内壁/壁厚/斜边饰条/缎面丝带/铰链盒盖蝴蝶结/盒内暖金光） ---------------- */

function buildP2GiftBox(pageNum, actor, pageState) {
  var opened = Boolean(pageState && pageState.p2 && pageState.p2.opened);
  var x = 1.2;
  var z = 0.42;
  var W = 0.72;
  var H = 0.5;
  var T = 0.035;

  var root = new THREE.Group();
  root.position.set(x, pageSurfaceY(x), z);
  root.rotation.y = -0.32;
  var inner = new THREE.Group();
  root.add(inner);

  var paperMat = new THREE.MeshStandardMaterial({
    map: getPropTexture("gift-paper", makeGiftPaperTexture),
    roughness: 0.48,
    metalness: 0.02
  });
  var innerWallMat = new THREE.MeshStandardMaterial({
    color: 0xfff0cf,
    roughness: 0.8,
    emissive: 0xffb64d,
    emissiveIntensity: opened ? 0.32 : 0.04
  });
  var ribbonMat = new THREE.MeshPhysicalMaterial({
    color: 0xd7304c,
    roughness: 0.34,
    metalness: 0.0,
    sheen: 1.0,
    sheenColor: new THREE.Color(0xff9fb3),
    sheenRoughness: 0.35,
    clearcoat: 0.3,
    clearcoatRoughness: 0.4
  });
  var ribbonHiMat = new THREE.MeshStandardMaterial({ color: 0xff5f7a, roughness: 0.28 });
  var trimMat = new THREE.MeshStandardMaterial({ color: 0xe9b949, roughness: 0.28, metalness: 0.78 });

  // 盒底 + 四面带厚度的墙（外侧礼品纸、内侧暖色内壁、顶缘金色斜面）
  var bottom = new THREE.Mesh(new THREE.BoxGeometry(W, T, W), [paperMat, paperMat, innerWallMat, paperMat, paperMat, paperMat]);
  bottom.position.y = T * 0.5;
  inner.add(bottom);
  var wallDefs = [
    { sx: W, sz: T, px: 0, pz: W * 0.5 - T * 0.5, outer: 4 },
    { sx: W, sz: T, px: 0, pz: -W * 0.5 + T * 0.5, outer: 5 },
    { sx: T, sz: W - T * 2, px: W * 0.5 - T * 0.5, pz: 0, outer: 0 },
    { sx: T, sz: W - T * 2, px: -W * 0.5 + T * 0.5, pz: 0, outer: 1 }
  ];
  var innerFaceOf = { 4: 5, 5: 4, 0: 1, 1: 0 };
  for (var wi = 0; wi < wallDefs.length; wi += 1) {
    var wd = wallDefs[wi];
    var mats = [paperMat, paperMat, trimMat, paperMat, paperMat, paperMat];
    mats[innerFaceOf[wd.outer]] = innerWallMat;
    var wall = new THREE.Mesh(new THREE.BoxGeometry(wd.sx, H, wd.sz), mats);
    wall.position.set(wd.px, H * 0.5, wd.pz);
    inner.add(wall);
  }
  // 金色斜面饰条：顶缘外圈 + 底缘外圈
  var trimSpecs = [
    { y: H - 0.012, s: 0.016 },
    { y: 0.014, s: 0.02 }
  ];
  for (var ts = 0; ts < trimSpecs.length; ts += 1) {
    var tsp = trimSpecs[ts];
    var fb = new THREE.BoxGeometry(W + tsp.s, 0.024, tsp.s);
    var lr = new THREE.BoxGeometry(tsp.s, 0.024, W + tsp.s);
    var t1 = new THREE.Mesh(fb, trimMat);
    t1.position.set(0, tsp.y, W * 0.5);
    var t2 = new THREE.Mesh(fb, trimMat);
    t2.position.set(0, tsp.y, -W * 0.5);
    var t3 = new THREE.Mesh(lr, trimMat);
    t3.position.set(W * 0.5, tsp.y, 0);
    var t4 = new THREE.Mesh(lr, trimMat);
    t4.position.set(-W * 0.5, tsp.y, 0);
    inner.add(t1, t2, t3, t4);
  }
  // 盒身外侧缎面丝带（中心高光条营造斜面质感）
  var rbW = 0.11;
  var rbFront = new THREE.Mesh(new THREE.BoxGeometry(rbW, H - 0.03, 0.01), ribbonMat);
  rbFront.position.set(0, H * 0.5, W * 0.5 + 0.006);
  var rbBack = rbFront.clone();
  rbBack.position.z = -W * 0.5 - 0.006;
  var rbRight = new THREE.Mesh(new THREE.BoxGeometry(0.01, H - 0.03, rbW), ribbonMat);
  rbRight.position.set(W * 0.5 + 0.006, H * 0.5, 0);
  var rbLeft = rbRight.clone();
  rbLeft.position.x = -W * 0.5 - 0.006;
  var hiFront = new THREE.Mesh(new THREE.BoxGeometry(0.032, H - 0.04, 0.006), ribbonHiMat);
  hiFront.position.set(0, H * 0.5, W * 0.5 + 0.012);
  var hiRight = new THREE.Mesh(new THREE.BoxGeometry(0.006, H - 0.04, 0.032), ribbonHiMat);
  hiRight.position.set(W * 0.5 + 0.012, H * 0.5, 0);
  inner.add(rbFront, rbBack, rbRight, rbLeft, hiFront, hiRight);

  // 盒内暖金光 + 软纸花
  var glowFloorMat = new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: opened ? 0.95 : 0.35 });
  var glowFloor = new THREE.Mesh(new THREE.PlaneGeometry(W - T * 2 - 0.01, W - T * 2 - 0.01), glowFloorMat);
  glowFloor.rotation.x = -Math.PI * 0.5;
  glowFloor.position.y = T + 0.003;
  inner.add(glowFloor);
  var tissueMat = new THREE.MeshStandardMaterial({ color: 0xffd3e1, roughness: 0.9, side: THREE.DoubleSide });
  var tissueSpots = [[-0.2, -0.2, 0.4], [0.21, -0.18, -0.5], [-0.18, 0.2, 2.6], [0.2, 0.2, -2.4]];
  for (var tq = 0; tq < tissueSpots.length; tq += 1) {
    var tissue = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 5, 1, true), tissueMat);
    tissue.position.set(tissueSpots[tq][0], H - 0.07, tissueSpots[tq][1]);
    tissue.rotation.set(tissueSpots[tq][1] > 0 ? 0.45 : -0.45, tissueSpots[tq][2], tissueSpots[tq][0] > 0 ? -0.45 : 0.45);
    inner.add(tissue);
  }
  var glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: engine.glowTex,
    color: 0xffd27a,
    transparent: true,
    opacity: opened ? 0.85 : 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  glowSprite.position.y = H + 0.06;
  glowSprite.scale.set(0.95, 0.95, 1);
  inner.add(glowSprite);
  configurePageLight(0, 0xffc56b, 2.4, 2, x, root.position.y + H * 0.75, z, opened ? 1.6 : 0);

  // 铰链盒盖（后缘铰链，带裙边壁厚、交叉丝带与立体缎面蝴蝶结）
  var lidW = W + T * 2 + 0.014;
  var lidT = 0.035;
  var skirtH = 0.1;
  var lidPivot = new THREE.Group();
  lidPivot.position.set(0, H + 0.004, -lidW * 0.5);
  var lidGroup = new THREE.Group();
  lidGroup.position.z = lidW * 0.5;
  lidPivot.add(lidGroup);
  var lidTop = new THREE.Mesh(new THREE.BoxGeometry(lidW, lidT, lidW), [paperMat, paperMat, paperMat, innerWallMat, paperMat, paperMat]);
  lidTop.position.y = lidT * 0.5;
  lidGroup.add(lidTop);
  var skirtFB = new THREE.BoxGeometry(lidW, skirtH, T);
  var skirtLR = new THREE.BoxGeometry(T, skirtH, lidW - T * 2);
  var sk1 = new THREE.Mesh(skirtFB, paperMat);
  sk1.position.set(0, lidT - skirtH * 0.5, lidW * 0.5 - T * 0.5);
  var sk2 = new THREE.Mesh(skirtFB, paperMat);
  sk2.position.set(0, lidT - skirtH * 0.5, -lidW * 0.5 + T * 0.5);
  var sk3 = new THREE.Mesh(skirtLR, paperMat);
  sk3.position.set(lidW * 0.5 - T * 0.5, lidT - skirtH * 0.5, 0);
  var sk4 = new THREE.Mesh(skirtLR, paperMat);
  sk4.position.set(-lidW * 0.5 + T * 0.5, lidT - skirtH * 0.5, 0);
  lidGroup.add(sk1, sk2, sk3, sk4);
  var lidTrimFB = new THREE.BoxGeometry(lidW + 0.012, 0.018, 0.012);
  var lidTrimLR = new THREE.BoxGeometry(0.012, 0.018, lidW + 0.012);
  var lt1 = new THREE.Mesh(lidTrimFB, trimMat);
  lt1.position.set(0, lidT - skirtH + 0.009, lidW * 0.5);
  var lt2 = new THREE.Mesh(lidTrimFB, trimMat);
  lt2.position.set(0, lidT - skirtH + 0.009, -lidW * 0.5);
  var lt3 = new THREE.Mesh(lidTrimLR, trimMat);
  lt3.position.set(lidW * 0.5, lidT - skirtH + 0.009, 0);
  var lt4 = new THREE.Mesh(lidTrimLR, trimMat);
  lt4.position.set(-lidW * 0.5, lidT - skirtH + 0.009, 0);
  lidGroup.add(lt1, lt2, lt3, lt4);
  var lrA = new THREE.Mesh(new THREE.BoxGeometry(lidW + 0.006, 0.012, rbW), ribbonMat);
  lrA.position.y = lidT + 0.006;
  var lrB = new THREE.Mesh(new THREE.BoxGeometry(rbW, 0.012, lidW + 0.006), ribbonMat);
  lrB.position.y = lidT + 0.006;
  var lrF = new THREE.Mesh(new THREE.BoxGeometry(rbW, skirtH, 0.01), ribbonMat);
  lrF.position.set(0, lidT - skirtH * 0.5, lidW * 0.5 + 0.005);
  var lrR = new THREE.Mesh(new THREE.BoxGeometry(0.01, skirtH, rbW), ribbonMat);
  lrR.position.set(lidW * 0.5 + 0.005, lidT - skirtH * 0.5, 0);
  var lrL = lrR.clone();
  lrL.position.x = -lidW * 0.5 - 0.005;
  lidGroup.add(lrA, lrB, lrF, lrR, lrL);

  var bow = new THREE.Group();
  bow.position.y = lidT + 0.012;
  var loopGeo = new THREE.TorusGeometry(0.085, 0.024, 10, 28);
  for (var side = -1; side <= 1; side += 2) {
    var loop = new THREE.Mesh(loopGeo, ribbonMat);
    loop.scale.set(1.2, 0.72, 1.35);
    loop.position.set(side * 0.092, 0.07, 0);
    loop.rotation.set(0, side * 0.42, side * -0.5);
    var tail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.008, 0.2), ribbonMat);
    tail.position.set(side * 0.06, 0.004, 0.11);
    tail.rotation.y = side * -0.55;
    var notch = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.04, 3), ribbonHiMat);
    notch.rotation.set(Math.PI * 0.5, 0, 0);
    notch.position.set(side * 0.118, 0.006, 0.2);
    bow.add(loop, tail, notch);
  }
  var knot = new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 10), ribbonMat);
  knot.scale.set(1.15, 0.9, 1.05);
  knot.position.y = 0.04;
  bow.add(knot);
  lidGroup.add(bow);
  inner.add(lidPivot);
  var openAngle = -1.95;
  lidPivot.rotation.x = opened ? openAngle : 0;

  root.traverse(function (ch) {
    if (ch.isMesh) {
      ch.castShadow = true;
      ch.receiveShadow = true;
    }
  });
  glowFloor.castShadow = false;

  var hitBox = makeHitMesh(new THREE.BoxGeometry(W + 0.34, H + 0.54, W + 0.34));
  hitBox.position.y = H * 0.6;
  inner.add(hitBox);

  // 乐迪空中运送时的金色高空提绳挂带（落地卸货后自动收起）
  var slingGroup = new THREE.Group();
  var slingMat = new THREE.MeshStandardMaterial({ color: 0xf7b801, roughness: 0.35, metalness: 0.4 });
  for (var sl = -1; sl <= 1; sl += 2) {
    var strap = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.44, 0.018), slingMat);
    strap.position.set(sl * (W * 0.25), H + 0.2, 0);
    strap.rotation.z = sl * 0.38;
    slingGroup.add(strap);
  }
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 16), slingMat);
  ring.position.set(0, H + 0.42, 0);
  slingGroup.add(ring);
  slingGroup.visible = !opened;
  inner.add(slingGroup);

  // 可飞出的精致 3D 皇冠
  var flyingCrown = makeMiniCrown3D();
  flyingCrown.scale.setScalar(0.95);
  flyingCrown.visible = false;
  engine.dioramaGroup.add(flyingCrown);

  var landY = pageSurfaceY(x);
  if (!opened) {
    root.position.set(-2.75, 1.85, -0.92);
    registerFoldable(root, "shrink", { order: 0.25 });
  } else {
    root.position.set(x, landY, z);
    registerFoldable(root, "squash");
  }
  engine.dioramaGroup.add(root);
  registerObstacle(x, z, 0.72);
  var groundShadow = addContactShadow(opened ? x : -2.75, (opened ? z : -0.92) + 0.04, W * 1.45, W * 0.75, opened ? 0.5 : 0.22);
  if (!opened) {
    groundShadow.scale.set(W * 0.55, W * 0.32, 1);
  }

  engine.p2Parcel = {
    group: root,
    inner: inner,
    lidPivot: lidPivot,
    slingGroup: slingGroup,
    groundShadow: groundShadow,
    shadowBaseW: W * 1.45,
    shadowBaseH: W * 0.75,
    boxW: W,
    openAngle: openAngle,
    glowMat: innerWallMat,
    glowFloorMat: glowFloorMat,
    glowSprite: glowSprite,
    glowLevel: opened ? 1.6 : 0,
    flyingCrown: flyingCrown,
    opened: opened,
    targetLidAngle: opened ? openAngle : 0,
    flightAnim: null,
    landingBounceUntil: 0,
    celebrateUntil: 0,
    originPos: new THREE.Vector3(x, landY + H * 0.7, z)
  };
  engine.p2Delivery = opened
    ? null
    : {
        active: true,
        phase: "waiting",
        startTs: 0,
        duration: 2450,
        startX: -2.75,
        startY: 1.85,
        startZ: -0.92,
        targetX: x,
        targetY: landY,
        targetZ: z,
        jettReleaseTs: 0
      };
  pushInteractable(hitBox, "parcel", pageNum, actor.id, actor.label, root);
}

function setP2GlowOpened(opened) {
  var pc = engine.p2Parcel;
  if (!pc) {
    return;
  }
  pc.glowMat.emissiveIntensity = opened ? 0.32 : 0.04;
  pc.glowFloorMat.opacity = opened ? 0.95 : 0.35;
}

function launchP2Crown3D() {
  var pc = engine.p2Parcel;
  if (!pc) {
    return;
  }
  pc.opened = true;
  pc.targetLidAngle = pc.openAngle;
  setP2GlowOpened(true);
  spawnParticleBurst3D(pc.originPos.x, pc.originPos.y + 0.2, pc.originPos.z, 26, "confetti");
  spawnParticleBurst3D(pc.originPos.x, pc.originPos.y + 0.25, pc.originPos.z, 18, "firework");

  var kikiSt = engine.standees["p2-kiki"];
  if (!kikiSt) {
    return;
  }
  commandActorMove(kikiSt, 0.25, 0.55, true);
  var startP = pc.originPos.clone();
  var dirSign = (kikiSt.facingScale || 1) >= 0 ? 1 : -1;
  var cOffX = kikiSt.crownMesh ? kikiSt.crownBaseX * dirSign : 0;
  var cOffY = kikiSt.crownMesh ? kikiSt.crownMesh.position.y : kikiSt.hWorld * 0.91;
  var endP = new THREE.Vector3(kikiSt.curX + cOffX, pageSurfaceY(kikiSt.curX) + cOffY, kikiSt.curZ);
  var ctrl = new THREE.Vector3((startP.x + endP.x) * 0.5, Math.max(startP.y, endP.y) + 1.25, (startP.z + endP.z) * 0.5 + 0.35);
  pc.flyingCrown.position.copy(startP);
  pc.flyingCrown.visible = true;
  pc.flightAnim = {
    startTs: performance.now(),
    duration: 1450,
    startP: startP,
    endP: endP,
    ctrl: ctrl,
    startScale: 0.95,
    endScale: kikiSt.crownMesh ? kikiSt.crownMesh.scale.x : 0.56,
    kikiSt: kikiSt
  };
}

/* ---------------- P3 5 只 3D 光泽泪滴气球 ---------------- */

function makeBalloonGeometry() {
  var pts = [];
  var n = 18;
  for (var i = 0; i <= n; i += 1) {
    var t = i / n;
    var ang = -Math.PI * 0.5 + t * Math.PI;
    var r = Math.cos(ang) * 0.24 * (1 - 0.18 * (1 - t) * (1 - t));
    var y = Math.sin(ang) * 0.29 + (1 - t) * (1 - t) * -0.03;
    pts.push(new THREE.Vector2(Math.max(0.004, r), y));
  }
  var geo = new THREE.LatheGeometry(pts, 26);
  geo.userData.shared = true;
  return geo;
}

function buildP3Balloons(pageData) {
  var items = pageData.items || [];
  var balloonGeo = getPropTexture("balloon-geo", makeBalloonGeometry);
  var strMat = new THREE.MeshStandardMaterial({ color: 0xfff8ec, roughness: 0.8 });
  for (var i = 0; i < items.length; i += 1) {
    var it = items[i];
    var x = ((it.x - 50) / 50) * 3.0;
    var y = 1.5 + (1 - it.y / 35) * 0.42;
    var z = -0.3 + (i % 2 === 0 ? 0.35 : -0.25);

    var root = new THREE.Group();
    root.position.set(x, y, z);
    var inner = new THREE.Group();
    root.add(inner);

    var mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(it.hex || "#ff5d8f"),
      roughness: 0.22,
      metalness: 0.02,
      clearcoat: 0.8,
      clearcoatRoughness: 0.18
    });
    var orb = new THREE.Mesh(balloonGeo, mat);
    orb.castShadow = true;
    var knot = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.05, 10), mat);
    knot.position.set(0, -0.33, 0);
    knot.rotation.x = Math.PI;
    var strCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.35, 0),
      new THREE.Vector3(0.05, -0.72, 0.03),
      new THREE.Vector3(-0.04, -1.1, -0.02),
      new THREE.Vector3(0.03, -1.45, 0)
    ]);
    var strMesh = new THREE.Mesh(new THREE.TubeGeometry(strCurve, 16, 0.005, 4, false), strMat);
    var hitSphere = makeHitMesh(new THREE.SphereGeometry(0.38, 10, 8));
    inner.add(orb, knot, strMesh, hitSphere);
    engine.dioramaGroup.add(root);
    registerFoldable(root, "shrink", { drop: true });

    var bObj = {
      id: it.id,
      group: inner,
      root: root,
      baseX: x,
      baseY: y,
      baseZ: z,
      curX: x,
      curY: y,
      curZ: z,
      vx: (i % 2 === 0 ? 1 : -1) * (0.14 + (i % 3) * 0.05),
      vy: 0.1 + (i % 3) * 0.08,
      vz: (i % 2 === 0 ? 0.06 : -0.07),
      phase: i * 1.15,
      bounceEnd: 0,
      squishUntil: 0,
      lastHitTs: 0,
      catcherId: null
    };
    engine.p3Balloons.push(bObj);
    pushInteractable(hitSphere, "balloon", 3, it.id, it.label, root, bObj);
  }
}

/* ---------------- P5 5 块 3D 凸点乐高积木 ---------------- */

function buildP5LegoBricks(pageData, pageState) {
  var items = pageData.items || [];
  var placedMap = (pageState && pageState.p5 && pageState.p5.placed) || {};
  var studGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.06, 14);
  for (var i = 0; i < items.length; i += 1) {
    var it = items[i];
    var isPlaced = Boolean(placedMap[it.id]);
    var x = -1.6 + i * 0.8;
    var z = 1.38;

    var root = new THREE.Group();
    root.position.set(x, pageSurfaceY(x), z);
    var inner = new THREE.Group();
    root.add(inner);
    var mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(it.hex || "#ef233c"), roughness: 0.28, metalness: 0.04 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.32), mat);
    body.position.y = 0.12;
    inner.add(body);
    for (var sx = -1; sx <= 1; sx += 2) {
      for (var sz = -1; sz <= 1; sz += 2) {
        var stud = new THREE.Mesh(studGeo, mat);
        stud.position.set(sx * 0.11, 0.27, sz * 0.075);
        inner.add(stud);
      }
    }
    shadowAll(inner, true, true);
    var hitBrick = makeHitMesh(new THREE.BoxGeometry(0.62, 0.46, 0.52));
    hitBrick.position.y = 0.2;
    inner.add(hitBrick);
    root.visible = !isPlaced;
    engine.dioramaGroup.add(root);
    registerFoldable(root, "squash");

    var bItem = { id: it.id, group: inner, root: root, baseX: x, baseY: 0, baseZ: z, placed: isPlaced, flying: null };
    engine.p5Bricks.push(bItem);
    pushInteractable(hitBrick, "brick", 5, it.id, it.label, root, bItem);
  }
}

/* ---------------- P5 可巡游互动的 3D 乐高积木小车 ---------------- */

function buildP5LegoCar() {
  var centerX = 0.25;
  var centerZ = 0.54;
  var rx = 1.25;
  var rz = 0.34;
  var initAngle = Math.PI * 0.74;
  var startX = centerX + Math.cos(initAngle) * rx;
  var startZ = centerZ + Math.sin(initAngle) * rz;
  var initYaw = Math.atan2(-Math.sin(initAngle) * rx, Math.cos(initAngle) * rz);

  var root = new THREE.Group();
  root.position.set(startX, pageSurfaceY(startX), startZ);
  var inner = new THREE.Group();
  inner.rotation.y = initYaw;
  root.add(inner);

  var chassisMat = new THREE.MeshStandardMaterial({ color: 0xffd60a, roughness: 0.32, metalness: 0.06 });
  var bodyMat = new THREE.MeshStandardMaterial({ color: 0xef233c, roughness: 0.28, metalness: 0.05 });
  var stripeMat = new THREE.MeshStandardMaterial({ color: 0x0096c7, roughness: 0.3, metalness: 0.05 });
  var roofMat = new THREE.MeshStandardMaterial({ color: 0xff70a6, roughness: 0.3, metalness: 0.04 });
  var bumperMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.12 });
  var tireMat = new THREE.MeshStandardMaterial({ color: 0x22252d, roughness: 0.85, metalness: 0.04 });
  var spokeMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.2 });
  var headLightMat = new THREE.MeshStandardMaterial({
    color: 0xfff8dc,
    emissive: 0xffe066,
    emissiveIntensity: 0.95,
    roughness: 0.18
  });
  var tailLightMat = new THREE.MeshStandardMaterial({
    color: 0xff4d6d,
    emissive: 0xff2a55,
    emissiveIntensity: 0.85,
    roughness: 0.22
  });
  var glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.56,
    roughness: 0.1,
    metalness: 0.0,
    clearcoat: 0.9
  });

  // 1) 明黄底盘大梁 + 前后灰白保险杠
  var chassis = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.055, 0.64), chassisMat);
  chassis.position.y = 0.088;
  var frontBumper = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.055, 0.055), bumperMat);
  frontBumper.position.set(0, 0.088, 0.325);
  var rearBumper = frontBumper.clone();
  rearBumper.position.z = -0.325;
  inner.add(chassis, frontBumper, rearBumper);

  // 2) 草莓红车体 + 引擎盖 4 颗凸点 + 侧面天蓝饰条
  var hood = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.11, 0.22), bodyMat);
  hood.position.set(0, 0.168, 0.175);
  var lowerCabin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.18), bodyMat);
  lowerCabin.position.set(0, 0.162, -0.02);
  var stripe = new THREE.Mesh(new THREE.BoxGeometry(0.368, 0.032, 0.56), stripeMat);
  stripe.position.set(0, 0.145, 0.0);
  inner.add(hood, lowerCabin, stripe);

  var studGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.026, 12);
  for (var hsx = -1; hsx <= 1; hsx += 2) {
    for (var hsz = 0; hsz < 2; hsz += 1) {
      var hStud = new THREE.Mesh(studGeo, bodyMat);
      hStud.position.set(hsx * 0.075, 0.235, 0.13 + hsz * 0.09);
      inner.add(hStud);
    }
  }

  // 3) 驾驶室：透明挡风玻璃 + 可爱乐高小黄司机 + 糖果粉带凸点车顶
  var cabBack = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.17, 0.042), bodyMat);
  cabBack.position.set(0, 0.255, -0.095);
  var windshield = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.145, 0.024), glassMat);
  windshield.position.set(0, 0.278, 0.068);
  windshield.rotation.x = -0.26;
  var roof = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.036, 0.22), roofMat);
  roof.position.set(0, 0.365, -0.01);
  inner.add(cabBack, windshield, roof);

  for (var rsx = -1; rsx <= 1; rsx += 2) {
    for (var rsz = -1; rsz <= 1; rsz += 2) {
      var rStud = new THREE.Mesh(studGeo, roofMat);
      rStud.position.set(rsx * 0.075, 0.396, -0.01 + rsz * 0.055);
      inner.add(rStud);
    }
  }

  var driverTorso = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.07), stripeMat);
  driverTorso.position.set(0, 0.22, -0.015);
  var driverHead = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.072, 14), chassisMat);
  driverHead.position.set(0, 0.292, -0.015);
  var driverCap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.026, 14), stripeMat);
  driverCap.position.set(0, 0.33, -0.015);
  inner.add(driverTorso, driverHead, driverCap);

  // 4) 车尾开放式货斗 + 3 块彩色迷你乐高积木块
  var bedFloor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.21), bodyMat);
  bedFloor.position.set(0, 0.135, -0.205);
  var sideWallL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.085, 0.21), bodyMat);
  sideWallL.position.set(-0.155, 0.19, -0.205);
  var sideWallR = sideWallL.clone();
  sideWallR.position.x = 0.155;
  var tailGate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.075, 0.03), bodyMat);
  tailGate.position.set(0, 0.185, -0.3);
  inner.add(bedFloor, sideWallL, sideWallR, tailGate);

  var cargoColors = [0x2ec4b6, 0xffd60a, 0xef233c];
  var cargoPos = [
    [-0.065, 0.185, -0.21, 0.15],
    [0.068, 0.185, -0.21, -0.1],
    [0.0, 0.242, -0.2, 0.08]
  ];
  var miniStudGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.016, 10);
  for (var ci = 0; ci < cargoPos.length; ci += 1) {
    var cMat = new THREE.MeshStandardMaterial({ color: cargoColors[ci], roughness: 0.28, metalness: 0.04 });
    var cargoGrp = new THREE.Group();
    cargoGrp.position.set(cargoPos[ci][0], cargoPos[ci][1], cargoPos[ci][2]);
    cargoGrp.rotation.y = cargoPos[ci][3];
    var cBlock = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.056, 0.082), cMat);
    var ms1 = new THREE.Mesh(miniStudGeo, cMat);
    ms1.position.set(-0.026, 0.034, 0);
    var ms2 = new THREE.Mesh(miniStudGeo, cMat);
    ms2.position.set(0.026, 0.034, 0);
    cargoGrp.add(cBlock, ms1, ms2);
    inner.add(cargoGrp);
  }

  // 5) 车头大灯 + 车尾红灯
  var lightGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.022, 12);
  lightGeo.rotateX(Math.PI * 0.5);
  for (var lx = -1; lx <= 1; lx += 2) {
    var hl = new THREE.Mesh(lightGeo, headLightMat);
    hl.position.set(lx * 0.11, 0.155, 0.288);
    var tl = new THREE.Mesh(lightGeo, tailLightMat);
    tl.scale.setScalar(0.8);
    tl.position.set(lx * 0.115, 0.148, -0.312);
    inner.add(hl, tl);
  }

  // 6) 4 只黑胶车轮 + 亮黄轮毂 + 辐条刻痕（绕局部 X 轴正向转动朝 +Z 前滚）
  var tireGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.062, 18);
  tireGeo.rotateZ(Math.PI * 0.5);
  var rimGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.066, 14);
  rimGeo.rotateZ(Math.PI * 0.5);
  var crossGeo = new THREE.BoxGeometry(0.072, 0.015, 0.084);
  var wheelCoords = [
    [-0.205, 0.085, 0.195],
    [0.205, 0.085, 0.195],
    [-0.205, 0.085, -0.195],
    [0.205, 0.085, -0.195]
  ];
  var wheels = [];
  for (var wi = 0; wi < wheelCoords.length; wi += 1) {
    var wg = new THREE.Group();
    wg.position.set(wheelCoords[wi][0], wheelCoords[wi][1], wheelCoords[wi][2]);
    var tire = new THREE.Mesh(tireGeo, tireMat);
    var rim = new THREE.Mesh(rimGeo, chassisMat);
    var spoke = new THREE.Mesh(crossGeo, spokeMat);
    wg.add(tire, rim, spoke);
    inner.add(wg);
    wheels.push(wg);
  }

  shadowAll(inner, true, true);
  windshield.castShadow = false;

  var hitCar = makeHitMesh(new THREE.BoxGeometry(0.72, 0.58, 1.0));
  hitCar.position.set(0, 0.28, 0);
  inner.add(hitCar);

  engine.dioramaGroup.add(root);
  registerFoldable(root, "squash", { order: 0.46 });
  var carShadow = addContactShadow(startX, startZ, 0.56, 0.84, 0.44);
  carShadow.rotation.y = initYaw;

  var carObj = {
    group: root,
    inner: inner,
    wheels: wheels,
    contact: carShadow,
    headLightMat: headLightMat,
    centerX: centerX,
    centerZ: centerZ,
    rx: rx,
    rz: rz,
    angle: initAngle,
    curX: startX,
    curZ: startZ,
    yaw: initYaw,
    wheelSpin: 0,
    wheelRadius: 0.085,
    boostUntil: 0,
    hopStartTs: 0,
    lastSparkTs: 0
  };
  engine.p5Car = carObj;
  pushInteractable(hitCar, "lego-car", 5, "p5-lego-car", "乐高积木小车", root, carObj);
}

/* ---------------- P6 纤细暖色灯线 + 半透明暖玻璃仙女灯泡 ---------------- */

var P6_BULB_PALETTE = [0xffc861, 0xff9ec4, 0xffb07a, 0xfff0b3, 0xd9b8ff];

function buildP6PartyLights(pageState) {
  var lightsOn = Boolean(pageState && pageState.p6 && pageState.p6.lightsOn);
  var root = new THREE.Group();
  root.position.set(0, 0, -1.6);

  // 三段自然下垂的悬链灯线
  var anchors = [
    { x: -3.0, y: 2.18 },
    { x: -1.0, y: 2.12 },
    { x: 1.0, y: 2.12 },
    { x: 3.0, y: 2.18 }
  ];
  var pts = [];
  for (var a = 0; a < anchors.length - 1; a += 1) {
    var A = anchors[a];
    var B = anchors[a + 1];
    var steps = 10;
    for (var s = a === 0 ? 0 : 1; s <= steps; s += 1) {
      var t = s / steps;
      var sag = 0.3 * 4 * t * (1 - t);
      pts.push(new THREE.Vector3(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t - sag, 0.12 * Math.sin(Math.PI * t)));
    }
  }
  var curve = new THREE.CatmullRomCurve3(pts);
  var cordMat = new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 0.55, metalness: 0.15 });
  var cord = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.0065, 5, false), cordMat);
  root.add(cord);

  var capMat = new THREE.MeshStandardMaterial({ color: 0xc89b4c, roughness: 0.3, metalness: 0.8 });
  var glassOff = new THREE.MeshStandardMaterial({
    color: 0xfff3dc,
    emissive: 0xffd9a0,
    emissiveIntensity: 0.16,
    roughness: 0.12,
    metalness: 0.0,
    transparent: true,
    opacity: 0.72
  });
  var glassOn = [];
  var haloMats = [];
  for (var pc = 0; pc < P6_BULB_PALETTE.length; pc += 1) {
    glassOn.push(new THREE.MeshStandardMaterial({
      color: 0xfffaf0,
      emissive: P6_BULB_PALETTE[pc],
      emissiveIntensity: 2.3,
      roughness: 0.12,
      transparent: true,
      opacity: 0.94
    }));
    haloMats.push(new THREE.SpriteMaterial({
      map: engine.glowTex,
      color: P6_BULB_PALETTE[pc],
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
  }
  var filamentMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
  var bulbGeo = new THREE.SphereGeometry(0.042, 14, 10);
  bulbGeo.scale(1, 1.3, 1);
  var capGeo = new THREE.CylinderGeometry(0.017, 0.02, 0.03, 8);
  var filGeo = new THREE.SphereGeometry(0.012, 6, 5);

  var bulbs = [];
  var count = 21;
  for (var i = 0; i < count; i += 1) {
    var pt = curve.getPoint((i + 0.5) / count);
    var palette = i % P6_BULB_PALETTE.length;
    var bulbG = new THREE.Group();
    bulbG.position.copy(pt);
    var cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = -0.016;
    var glass = new THREE.Mesh(bulbGeo, lightsOn ? glassOn[palette] : glassOff);
    glass.position.y = -0.07;
    glass.castShadow = false;
    var fil = new THREE.Mesh(filGeo, filamentMat);
    fil.position.y = -0.07;
    fil.visible = lightsOn;
    var halo = new THREE.Sprite(haloMats[palette]);
    halo.position.y = -0.07;
    halo.scale.set(0.34, 0.34, 1);
    halo.visible = lightsOn;
    bulbG.add(cap, glass, fil, halo);
    root.add(bulbG);
    bulbs.push({ glass: glass, fil: fil, halo: halo, palette: palette, phase: i * 0.77 });
    pushInteractable(glass, "lights", 6, "p6-string-lights", "点亮星光灯串", glass);
  }

  var hitBar = makeHitMesh(new THREE.BoxGeometry(6.2, 0.72, 0.6));
  hitBar.position.set(0, 1.98, 0);
  root.add(hitBar);
  pushInteractable(hitBar, "lights", 6, "p6-string-lights", "点亮星光灯串", hitBar);

  configurePageLight(1, 0xffcf70, 10, 1.4, 0, 2.1, -0.5, lightsOn ? 3.2 : 0);

  engine.dioramaGroup.add(root);
  registerFoldable(root, "shrink", { order: 0.05 });
  engine.p6Lights = { group: root, bulbs: bulbs, glassOn: glassOn, glassOff: glassOff, on: lightsOn };
}

function setP6Lights(on) {
  var L = engine.p6Lights;
  if (!L) {
    return;
  }
  L.on = on;
  setPageLightBase(1, on ? 3.2 : 0);
  for (var i = 0; i < L.bulbs.length; i += 1) {
    var b = L.bulbs[i];
    b.glass.material = on ? L.glassOn[b.palette] : L.glassOff;
    b.fil.visible = on;
    b.halo.visible = on;
  }
  if (engine.p6TreasureStage && engine.p6TreasureStage.crystalMat) {
    engine.p6TreasureStage.crystalMat.emissiveIntensity = on ? 1.15 : 0.25;
  }
}

/* ---------------- P4 汪汪队 3D 勇敢徽章（随小狗登场、收集后飞向 KIKI 护航） ---------------- */

var P4_BADGE_DEFS = [
  { actorId: "p4-chase", badgeKey: "chase", color: 0x2563eb, label: "阿奇警长徽章" },
  { actorId: "p4-skye", badgeKey: "skye", color: 0xf43f8e, label: "天天飞翔徽章" },
  { actorId: "p4-marshall", badgeKey: "marshall", color: 0xef4444, label: "毛毛勇敢徽章" }
];

function buildP4Badges(pageState) {
  var collectedMap = (pageState && pageState.p4 && (pageState.p4.collected || pageState.p4.badges)) || {};
  var kikiSt = engine.standees["p4-kiki"];
  var kx = kikiSt ? kikiSt.curX : -1.45;
  var kz = kikiSt ? kikiSt.curZ : 0.42;

  var goldMat = new THREE.MeshStandardMaterial({ color: 0xf6c453, roughness: 0.24, metalness: 0.78 });
  var starMat = new THREE.MeshStandardMaterial({ color: 0xfff8dc, emissive: 0xffd166, emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.4 });
  var rimGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.032, 8);
  rimGeo.rotateX(Math.PI * 0.5);
  var faceGeo = new THREE.CylinderGeometry(0.132, 0.132, 0.038, 8);
  faceGeo.rotateX(Math.PI * 0.5);
  var starGeo = new THREE.OctahedronGeometry(0.056, 0);
  starGeo.scale(1, 1, 0.5);

  for (var i = 0; i < P4_BADGE_DEFS.length; i += 1) {
    var def = P4_BADGE_DEFS[i];
    var pupSt = engine.standees[def.actorId];
    var collected = Boolean(collectedMap[def.badgeKey] || collectedMap[def.actorId]);
    var hoverX = pupSt ? pupSt.curX + (i === 2 ? -0.44 : 0.42) : -0.6 + i * 1.1;
    var hoverY = (pupSt ? pageSurfaceY(pupSt.curX) + pupSt.hWorld * 0.72 : 0.95);
    var hoverZ = pupSt ? pupSt.curZ + 0.12 : 0.15;

    var orbitAng = i * ((Math.PI * 2) / 3);
    var initX = collected ? kx + Math.cos(orbitAng) * 0.56 : hoverX;
    var initY = collected ? pageSurfaceY(kx) + 1.05 + Math.sin(i) * 0.08 : hoverY;
    var initZ = collected ? kz + Math.sin(orbitAng) * 0.34 : hoverZ;

    var root = new THREE.Group();
    root.position.set(initX, initY, initZ);
    var inner = new THREE.Group();
    root.add(inner);

    var rim = new THREE.Mesh(rimGeo, goldMat);
    var faceMat = new THREE.MeshStandardMaterial({
      color: def.color,
      emissive: def.color,
      emissiveIntensity: collected ? 0.55 : 0.2,
      roughness: 0.32,
      metalness: 0.15
    });
    var face = new THREE.Mesh(faceGeo, faceMat);
    var gem = new THREE.Mesh(starGeo, starMat);
    var halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: engine.glowTex,
      color: def.color,
      transparent: true,
      opacity: collected ? 0.85 : 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    halo.scale.set(0.46, 0.46, 1);
    var hit = makeHitMesh(new THREE.SphereGeometry(0.24, 8, 6));
    inner.add(rim, face, gem, halo, hit);

    engine.dioramaGroup.add(root);
    registerFoldable(root, "shrink", { drop: true, order: 0.35 + i * 0.12 });
    pushInteractable(hit, "actor", 4, def.actorId, def.label, root);

    engine.p4Badges.push({
      actorId: def.actorId,
      root: root,
      inner: inner,
      faceMat: faceMat,
      halo: halo,
      mode: collected ? "orbit" : "hover",
      hoverX: hoverX,
      hoverY: hoverY,
      hoverZ: hoverZ,
      curX: initX,
      curY: initY,
      curZ: initZ,
      orbitAngle: orbitAng,
      phase: i * 1.4,
      flight: null
    });
  }
}

/* ---------------- P6 中央 3D 魔法宝物展示台（同步解锁进度与灯串亮度） ---------------- */

function buildP6TreasureStage(pageState) {
  var lightsOn = Boolean(pageState && pageState.p6 && pageState.p6.lightsOn);
  var sx = 0;
  var sz = -0.18;
  var sy = pageSurfaceY(sx);

  var stageRoot = new THREE.Group();
  stageRoot.position.set(sx, sy, sz);

  var baseMat = new THREE.MeshStandardMaterial({ color: 0xfff5e4, roughness: 0.42, metalness: 0.08 });
  var velvetMat = new THREE.MeshStandardMaterial({ color: 0x7b2cbf, roughness: 0.78 });
  var goldMat = new THREE.MeshStandardMaterial({ color: 0xf6c453, roughness: 0.25, metalness: 0.78 });
  var crystalMat = new THREE.MeshStandardMaterial({
    color: 0xffefb3,
    emissive: 0xffc857,
    emissiveIntensity: lightsOn ? 1.15 : 0.25,
    roughness: 0.18,
    metalness: 0.25
  });

  var tier1 = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.7, 0.08, 28), baseMat);
  tier1.position.y = 0.04;
  tier1.receiveShadow = true;
  tier1.castShadow = true;
  var ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.014, 8, 32), goldMat);
  ring1.rotation.x = Math.PI * 0.5;
  ring1.position.y = 0.08;

  var tier2 = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.54, 0.085, 28), velvetMat);
  tier2.position.y = 0.12;
  tier2.castShadow = true;
  var ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.012, 8, 32), goldMat);
  ring2.rotation.x = Math.PI * 0.5;
  ring2.position.y = 0.16;

  var pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.08, 0.28, 12), goldMat);
  pillar.position.y = 0.3;
  var crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 0), crystalMat);
  crystal.position.y = 0.5;
  stageRoot.add(tier1, ring1, tier2, ring2, pillar, crystal);

  var ids = ["crown-5", "rainbow-balloons", "paw-musicbox", "lego-candy-tower"];
  var items = [];
  for (var i = 0; i < ids.length; i += 1) {
    var ang = (i / ids.length) * Math.PI * 2 + Math.PI * 0.25;
    var r = 0.37;
    var wrap = new THREE.Group();
    wrap.position.set(Math.cos(ang) * r, 0.175, Math.sin(ang) * r);
    var mdl = createSouvenirModel(ids[i], makeGlowMat);
    mdl.scale.setScalar(0.38);
    var mats = [];
    mdl.traverse(function (ch) {
      if (ch.isMesh && ch.material && ch.material.emissive && mats.indexOf(ch.material) < 0) {
        mats.push(ch.material);
      }
    });
    wrap.add(mdl);
    stageRoot.add(wrap);
    items.push({ id: ids[i], wrap: wrap, baseY: 0.175, phase: i * 1.1, mats: mats });
  }

  engine.dioramaGroup.add(stageRoot);
  registerFoldable(stageRoot, "squash", { order: 0.35 });
  registerObstacle(sx, sz, 0.74);
  addContactShadow(sx, sz + 0.02, 1.5, 0.72, 0.44);

  engine.p6TreasureStage = {
    root: stageRoot,
    crystal: crystal,
    crystalMat: crystalMat,
    items: items
  };
}

/* ---------------- P7 螺纹蜡烛 + 双层泪滴火苗 + 会吹气的小云朵 ---------------- */

function makeFlameGeometry(scale) {
  var prof = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.016, 0.012),
    new THREE.Vector2(0.024, 0.034),
    new THREE.Vector2(0.021, 0.06),
    new THREE.Vector2(0.012, 0.088),
    new THREE.Vector2(0.0, 0.118)
  ];
  var pts = [];
  for (var i = 0; i < prof.length; i += 1) {
    pts.push(new THREE.Vector2(prof[i].x * scale, prof[i].y * scale));
  }
  return new THREE.LatheGeometry(pts, 14);
}

function buildP7CandlesAndCloud(cakeSt, dieCut, pageState) {
  registerObstacle(cakeSt.baseX, cakeSt.baseZ, 0.88);
  var blownMap = (pageState && pageState.p7 && pageState.p7.blown) || {};
  var candleTips = (engine.storyData && engine.storyData.spriteConfig && engine.storyData.spriteConfig.defaultCakeCandleTips) || [];
  var cakeW = cakeSt.wWorld;
  var cakeH = cakeSt.hWorld;
  var outerFlameGeo = makeFlameGeometry(1);
  var innerFlameGeo = makeFlameGeometry(0.55);
  var outerFlameMat = new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.88, depthWrite: false });
  var innerFlameMat = new THREE.MeshBasicMaterial({ color: 0xfff4c2 });
  var wickMat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.9 });
  var haloMat = new THREE.SpriteMaterial({ map: engine.glowTex, color: 0xffb347, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  var litCount = 0;

  for (var i = 0; i < 5; i += 1) {
    var tip = candleTips[i] || { id: "candle-" + (i + 1), color: "#ffbe0b", xPct: 32 + i * 9, yPct: 0.6 };
    var xPct = typeof tip.xPct === "number" ? tip.xPct : 32 + i * 9;
    var yPct = typeof tip.yPct === "number" ? tip.yPct : 0.6;
    var u = dieCut.padFracX + (xPct / 100) * dieCut.innerFracX;
    var v = dieCut.padFracY + (yPct / 100) * dieCut.innerFracY;
    var lx = (u - 0.5) * cakeW;
    var tipY = cakeH * (1 - v);
    var isLit = !blownMap[tip.id];
    if (isLit) {
      litCount += 1;
    }

    var cGrp = new THREE.Group();
    cGrp.position.set(lx, tipY, 0.035);
    var stripeTex = getPropTexture("candle-" + tip.color, (function (hex) {
      return function () {
        return makeCandleStripeTexture(hex);
      };
    })(tip.color || "#ffbe0b"));
    var stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.021, 0.12, 12),
      new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.4 })
    );
    stick.position.y = -0.06;
    stick.castShadow = true;
    var wick = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.026, 4), wickMat);
    wick.position.y = 0.012;
    var flameG = new THREE.Group();
    flameG.position.y = 0.02;
    var outer = new THREE.Mesh(outerFlameGeo, outerFlameMat);
    var core = new THREE.Mesh(innerFlameGeo, innerFlameMat);
    core.position.y = 0.006;
    flameG.add(outer, core);
    flameG.visible = isLit;
    var halo = new THREE.Sprite(haloMat);
    halo.position.y = 0.075;
    halo.scale.set(0.24, 0.3, 1);
    halo.visible = isLit;
    var hitCyl = makeHitMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.36, 8));
    hitCyl.position.y = 0.02;
    cGrp.add(stick, wick, flameG, halo, hitCyl);
    cakeSt.pivot.add(cGrp);

    var worldPos = new THREE.Vector3(cakeSt.baseX + lx, cakeSt.baseY + tipY + 0.07, cakeSt.baseZ + 0.035);
    var cObj = { id: tip.id, group: cGrp, flame: flameG, halo: halo, lit: isLit, phase: i * 1.3, worldPos: worldPos };
    engine.p7Candles.push(cObj);
    pushInteractable(hitCyl, "candle", 7, tip.id, tip.label || "吹灭第" + (i + 1) + "根蜡烛", cGrp, cObj);
  }

  configurePageLight(1, 0xffb74d, 6, 1.5, cakeSt.baseX, cakeSt.baseY + cakeH + 0.45, cakeSt.baseZ + 0.45, litCount * 0.45);
  engine.p7CandleLight = true;

  // 蓬松小白云（蛋糕右上方，鼓腮吹气即可吹灭全部蜡烛）
  var cloudRoot = new THREE.Group();
  cloudRoot.position.set(cakeSt.baseX + 1.05, 1.58, cakeSt.baseZ + 0.5);
  var cloudInner = new THREE.Group();
  cloudRoot.add(cloudInner);
  var cMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe3f0ff, emissiveIntensity: 0.25, roughness: 0.55 });
  var puffs = [
    { x: 0, y: 0, z: 0, r: 0.22 },
    { x: -0.21, y: -0.05, z: 0.02, r: 0.16 },
    { x: 0.22, y: -0.04, z: -0.02, r: 0.17 },
    { x: 0.09, y: 0.14, z: 0.02, r: 0.15 },
    { x: -0.1, y: 0.11, z: -0.04, r: 0.13 },
    { x: 0.33, y: -0.08, z: 0.04, r: 0.11 },
    { x: -0.33, y: -0.09, z: -0.02, r: 0.1 }
  ];
  for (var pi = 0; pi < puffs.length; pi += 1) {
    var pf = puffs[pi];
    var m = new THREE.Mesh(new THREE.SphereGeometry(pf.r, 16, 12), cMat);
    m.position.set(pf.x, pf.y, pf.z);
    m.scale.y = 0.86;
    m.castShadow = true;
    cloudInner.add(m);
  }
  var faceMat = new THREE.MeshBasicMaterial({ color: 0x4a3a52 });
  var cheekMat = new THREE.MeshBasicMaterial({ color: 0xffb3c6, transparent: true, opacity: 0.8 });
  var eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), faceMat);
  eyeL.position.set(-0.11, 0.03, 0.2);
  var eyeR = eyeL.clone();
  eyeR.position.x = -0.02;
  var mouth = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.007, 6, 12), faceMat);
  mouth.position.set(-0.075, -0.035, 0.205);
  var cheek = new THREE.Mesh(new THREE.CircleGeometry(0.022, 12), cheekMat);
  cheek.position.set(-0.155, -0.015, 0.205);
  cloudInner.add(eyeL, eyeR, mouth, cheek);
  cloudInner.rotation.y = -0.35;
  var hitCloud = makeHitMesh(new THREE.SphereGeometry(0.44, 10, 8));
  cloudInner.add(hitCloud);
  cloudRoot.visible = litCount > 0;
  engine.dioramaGroup.add(cloudRoot);
  registerFoldable(cloudRoot, "shrink", { drop: true, order: 0.9 });
  engine.p7Cloud = {
    group: cloudRoot,
    inner: cloudInner,
    hit: hitCloud,
    baseX: cakeSt.baseX + 1.05,
    baseY: 1.58,
    baseZ: cakeSt.baseZ + 0.5,
    blowTargetX: cakeSt.baseX + 0.44,
    blowTargetY: cakeSt.baseY + cakeH + 0.48,
    blowTargetZ: cakeSt.baseZ + 0.42,
    puffUntil: 0
  };
  pushInteractable(hitCloud, "blow-all", 7, "p7-cloud-blow", "吹灭所有蜡烛", cloudRoot);
}

function setCandleLit(cd, lit) {
  cd.lit = lit;
  cd.flame.visible = lit;
  cd.halo.visible = lit;
}

function refreshCandleLight() {
  var remain = 0;
  for (var i = 0; i < engine.p7Candles.length; i += 1) {
    if (engine.p7Candles[i].lit) {
      remain += 1;
    }
  }
  if (engine.p7CandleLight) {
    setPageLightBase(1, remain * 0.45);
  }
  return remain;
}

/* ---------------- P7 丰富派对桌面道具（纸杯蛋糕/马卡龙甜点碟/瓷盘叉/派对帽/礼盒/茶烛） ---------------- */

function buildP7PartyTableProps(cakeSt) {
  var cupGeo = new THREE.CylinderGeometry(0.08, 0.058, 0.088, 12);
  var frostBaseGeo = new THREE.CylinderGeometry(0.072, 0.088, 0.048, 14);
  var frostTopGeo = new THREE.SphereGeometry(0.058, 12, 10);
  var cherryGeo = new THREE.SphereGeometry(0.022, 10, 8);
  var plateGeo = new THREE.CylinderGeometry(0.24, 0.18, 0.022, 20);
  var plateRimGeo = new THREE.TorusGeometry(0.23, 0.008, 6, 24);
  plateRimGeo.rotateX(Math.PI * 0.5);
  var macShellGeo = new THREE.SphereGeometry(0.044, 12, 8);
  macShellGeo.scale(1, 0.42, 1);

  var goldMat = new THREE.MeshStandardMaterial({ color: 0xf4c44e, roughness: 0.25, metalness: 0.78 });
  var whitePorcelain = new THREE.MeshStandardMaterial({ color: 0xfffaf3, roughness: 0.22, metalness: 0.04 });
  var creamFill = new THREE.MeshStandardMaterial({ color: 0xfff8eb, roughness: 0.5 });
  var cherryMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.25 });
  var cupWrapColors = [0xffb3c6, 0xa8e6cf, 0xfde68a, 0xc4b5fd];
  var frostColors = [0xff85a1, 0xffd166, 0x7dd3fc, 0xf472b6];

  var cupcakeSpots = [
    { x: -1.82, z: 1.24, order: 0.18 },
    { x: -0.62, z: 1.28, order: 0.34 },
    { x: 0.62, z: 1.26, order: 0.62 },
    { x: 1.82, z: 1.22, order: 0.78 }
  ];
  for (var ci = 0; ci < cupcakeSpots.length; ci += 1) {
    var cs = cupcakeSpots[ci];
    var cRoot = new THREE.Group();
    cRoot.position.set(cs.x, pageSurfaceY(cs.x), cs.z);
    var cInner = new THREE.Group();
    cRoot.add(cInner);
    var cup = new THREE.Mesh(cupGeo, new THREE.MeshStandardMaterial({ color: cupWrapColors[ci], roughness: 0.68 }));
    cup.position.y = 0.044;
    cup.castShadow = true;
    var fMat = new THREE.MeshStandardMaterial({ color: frostColors[ci], roughness: 0.35 });
    var f1 = new THREE.Mesh(frostBaseGeo, fMat);
    f1.position.y = 0.105;
    var f2 = new THREE.Mesh(frostTopGeo, fMat);
    f2.scale.y = 0.78;
    f2.position.y = 0.145;
    var berry = new THREE.Mesh(cherryGeo, cherryMat);
    berry.position.y = 0.195;
    var cHit = makeHitMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.26, 8));
    cHit.position.y = 0.12;
    cInner.add(cup, f1, f2, berry, cHit);
    engine.dioramaGroup.add(cRoot);
    registerFoldable(cRoot, "squash", { order: cs.order });
    addContactShadow(cs.x, cs.z + 0.015, 0.22, 0.12, 0.32);
    var cObj = { id: "p7-cupcake-" + ci, inner: cInner, x: cs.x, z: cs.z, bounceUntil: 0 };
    engine.p7Treats.push(cObj);
    pushInteractable(cHit, "p7-treat", 7, cObj.id, "草莓奶油纸杯蛋糕", cRoot, cObj);
  }

  var plateSpots = [
    { x: -0.58, z: 0.36, order: 0.38 },
    { x: 0.68, z: 0.34, order: 0.58 }
  ];
  var macColors = [0xff8fab, 0x80ed99, 0xfde047];
  for (var pi = 0; pi < plateSpots.length; pi += 1) {
    var ps = plateSpots[pi];
    var pRoot = new THREE.Group();
    pRoot.position.set(ps.x, pageSurfaceY(ps.x), ps.z);
    var pInner = new THREE.Group();
    pRoot.add(pInner);
    var plate = new THREE.Mesh(plateGeo, whitePorcelain);
    plate.position.y = 0.011;
    plate.receiveShadow = true;
    var rim = new THREE.Mesh(plateRimGeo, goldMat);
    rim.position.y = 0.022;
    pInner.add(plate, rim);
    for (var mi = 0; mi < 3; mi += 1) {
      var mac = new THREE.Group();
      var ma = (mi / 3) * Math.PI * 2 + pi * 0.4;
      mac.position.set(Math.cos(ma) * 0.09, 0.024, Math.sin(ma) * 0.08);
      var mMat = new THREE.MeshStandardMaterial({ color: macColors[(mi + pi) % macColors.length], roughness: 0.38 });
      var bot = new THREE.Mesh(macShellGeo, mMat);
      bot.position.y = 0.016;
      var fill = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.014, 12), creamFill);
      fill.position.y = 0.032;
      var top = new THREE.Mesh(macShellGeo, mMat);
      top.position.y = 0.046;
      mac.add(bot, fill, top);
      pInner.add(mac);
    }
    var sBerry = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.055, 8), cherryMat);
    sBerry.position.set(0.02, 0.05, 0.02);
    var pHit = makeHitMesh(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 10));
    pHit.position.y = 0.07;
    pInner.add(sBerry, pHit);
    engine.dioramaGroup.add(pRoot);
    registerFoldable(pRoot, "squash", { order: ps.order });
    registerObstacle(ps.x, ps.z, 0.34);
    addContactShadow(ps.x, ps.z + 0.015, 0.48, 0.24, 0.34);
    var pObj = { id: "p7-macarons-" + pi, inner: pInner, x: ps.x, z: ps.z, bounceUntil: 0 };
    engine.p7Treats.push(pObj);
    pushInteractable(pHit, "p7-treat", 7, pObj.id, "马卡龙草莓甜点碟", pRoot, pObj);
  }

  // 两摞叠放甜点瓷盘 + 迷你金色蛋糕叉
  var stackXs = [-1.18, 1.22];
  for (var si = 0; si < stackXs.length; si += 1) {
    var sx = stackXs[si];
    var sz = si === 0 ? 1.32 : 1.3;
    var sRoot = new THREE.Group();
    sRoot.position.set(sx, pageSurfaceY(sx), sz);
    for (var layer = 0; layer < 3; layer += 1) {
      var spPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.016, 16), whitePorcelain);
      spPlate.position.y = 0.008 + layer * 0.017;
      var spRim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.005, 5, 18), goldMat);
      spRim.rotation.x = Math.PI * 0.5;
      spRim.position.y = 0.016 + layer * 0.017;
      sRoot.add(spPlate, spRim);
    }
    var fork = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.008, 0.2), goldMat);
    fork.position.set(si === 0 ? 0.22 : -0.22, 0.006, 0.02);
    fork.rotation.y = si === 0 ? -0.25 : 0.25;
    sRoot.add(fork);
    engine.dioramaGroup.add(sRoot);
    registerFoldable(sRoot, "squash", { order: 0.45 + si * 0.2 });
    addContactShadow(sx, sz + 0.015, 0.35, 0.18, 0.28);
  }

  // 3 顶俏皮派对圆锥尖顶帽
  var hatSpecs = [
    { x: -2.44, z: 1.18, body: 0x38bdf8, pom: 0xfef08a, order: 0.12 },
    { x: 0.04, z: 1.34, body: 0xf472b6, pom: 0xfff8dc, order: 0.48 },
    { x: 2.46, z: 1.16, body: 0xa78bfa, pom: 0xfef08a, order: 0.88 }
  ];
  for (var hi = 0; hi < hatSpecs.length; hi += 1) {
    var hs = hatSpecs[hi];
    var hRoot = new THREE.Group();
    hRoot.position.set(hs.x, pageSurfaceY(hs.x), hs.z);
    var cone = new THREE.Mesh(new THREE.ConeGeometry(0.082, 0.22, 14), new THREE.MeshStandardMaterial({ color: hs.body, roughness: 0.48 }));
    cone.position.y = 0.11;
    cone.castShadow = true;
    var band = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.01, 6, 16), goldMat);
    band.rotation.x = Math.PI * 0.5;
    band.position.y = 0.01;
    var pom = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), new THREE.MeshStandardMaterial({ color: hs.pom, roughness: 0.7 }));
    pom.position.y = 0.225;
    hRoot.add(cone, band, pom);
    engine.dioramaGroup.add(hRoot);
    registerFoldable(hRoot, "squash", { order: hs.order });
    addContactShadow(hs.x, hs.z + 0.015, 0.22, 0.12, 0.28);
  }

  // 2 份桌面丝带迷你礼物盒
  var giftSpecs = [
    { x: -2.22, z: 0.22, box: 0xf472b6, rib: 0xfde047, ry: 0.28, order: 0.16 },
    { x: 2.24, z: 0.2, box: 0x38bdf8, rib: 0xff6b8b, ry: -0.32, order: 0.84 }
  ];
  for (var gi = 0; gi < giftSpecs.length; gi += 1) {
    var gs = giftSpecs[gi];
    var gRoot = new THREE.Group();
    gRoot.position.set(gs.x, pageSurfaceY(gs.x), gs.z);
    gRoot.rotation.y = gs.ry;
    var gBox = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.17, 0.22), new THREE.MeshStandardMaterial({ color: gs.box, roughness: 0.45 }));
    gBox.position.y = 0.085;
    gBox.castShadow = true;
    var rMat = new THREE.MeshStandardMaterial({ color: gs.rib, roughness: 0.3 });
    var r1 = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.178, 0.04), rMat);
    r1.position.y = 0.089;
    var r2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.178, 0.23), rMat);
    r2.position.y = 0.089;
    var bowKnot = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.012, 6, 12), rMat);
    bowKnot.position.y = 0.185;
    gRoot.add(gBox, r1, r2, bowKnot);
    engine.dioramaGroup.add(gRoot);
    registerFoldable(gRoot, "squash", { order: gs.order });
    registerObstacle(gs.x, gs.z, 0.24);
    addContactShadow(gs.x, gs.z + 0.015, 0.3, 0.16, 0.34);
  }

  // 4 只磨砂玻璃许愿茶烛杯（与蛋糕主蜡烛呼应微光，无需单独逐个吹灭）
  var glassMat = new THREE.MeshStandardMaterial({ color: 0xfff8eb, roughness: 0.22, transparent: true, opacity: 0.56 });
  var teaFlameMat = new THREE.MeshBasicMaterial({ color: 0xffc857 });
  var teaHaloMat = new THREE.SpriteMaterial({ map: engine.glowTex, color: 0xffb347, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  var teaSpots = [
    { x: -1.32, z: 0.42, order: 0.26 },
    { x: -0.24, z: 1.16, order: 0.44 },
    { x: 0.36, z: 1.16, order: 0.54 },
    { x: 1.36, z: 0.44, order: 0.72 }
  ];
  for (var ti = 0; ti < teaSpots.length; ti += 1) {
    var tsSpot = teaSpots[ti];
    var tRoot = new THREE.Group();
    tRoot.position.set(tsSpot.x, pageSurfaceY(tsSpot.x), tsSpot.z);
    var cupGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.048, 0.088, 12), glassMat);
    cupGlass.position.y = 0.044;
    var tFlame = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.046, 8), teaFlameMat);
    tFlame.position.y = 0.092;
    var tHalo = new THREE.Sprite(teaHaloMat);
    tHalo.position.y = 0.1;
    tHalo.scale.set(0.24, 0.24, 1);
    tRoot.add(cupGlass, tFlame, tHalo);
    engine.dioramaGroup.add(tRoot);
    registerFoldable(tRoot, "squash", { order: tsSpot.order });
    if (tsSpot.z < 0.8) {
      registerObstacle(tsSpot.x, tsSpot.z, 0.18);
    }
    engine.p7TeaFlames.push({ flame: tFlame, halo: tHalo, phase: ti * 1.4 });
  }
}

/* ---------------- P8 夜空后墙可点放烟花 ---------------- */
function buildP8NightSkyHotspot() {
  var hitSky = makeHitMesh(new THREE.PlaneGeometry(BOOK_W - 0.4, WALL_H * 0.72));
  hitSky.position.set(0, 1.95, -1.82);
  engine.dioramaGroup.add(hitSky);
  pushInteractable(hitSky, "fireworks", 8, "p8-fireworks-sky", "放夜空烟花", hitSky);
  engine.p8Trails.nextFwTs = performance.now() + 900;
}

/* ======================== 预分配 InstancedMesh 粒子池（零 GC） ======================== */

var CONFETTI_COLORS = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x9b5de5, 0xff70a6];
var SPARK_COLORS = [0xfff1a8, 0xffc4e1, 0xa8e6ff, 0xffd27a, 0xd9b8ff, 0xb8ffd9];
var SMOKE_COLORS = [0xe2e8f0, 0xf8fafc, 0xcbd5e1];

function makeParticlePool(geo, mat, cap, kind) {
  var mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  var white = new THREE.Color(0xffffff);
  for (var i = 0; i < cap; i += 1) {
    mesh.setMatrixAt(i, engine.zeroMatrix);
    mesh.setColorAt(i, white);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor.needsUpdate = true;
  }
  engine.particleGroup.add(mesh);
  return {
    kind: kind,
    mesh: mesh,
    cap: cap,
    next: 0,
    active: 0,
    px: new Float32Array(cap),
    py: new Float32Array(cap),
    pz: new Float32Array(cap),
    vx: new Float32Array(cap),
    vy: new Float32Array(cap),
    vz: new Float32Array(cap),
    rx: new Float32Array(cap),
    ry: new Float32Array(cap),
    spinX: new Float32Array(cap),
    spinY: new Float32Array(cap),
    size: new Float32Array(cap),
    life: new Float32Array(cap),
    maxLife: new Float32Array(cap),
    gravity: new Float32Array(cap)
  };
}

function createParticlePools() {
  engine.pools = {
    confetti: makeParticlePool(
      new THREE.PlaneGeometry(1.4, 0.8),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      260,
      "confetti"
    ),
    spark: makeParticlePool(
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      220,
      "spark"
    ),
    smoke: makeParticlePool(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }),
      72,
      "smoke"
    )
  };
}

function spawnParticleBurst3D(x, y, z, count, kind) {
  if (!engine.pools) {
    return;
  }
  var poolKey = kind === "smoke" ? "smoke" : (kind === "firework" ? "spark" : "confetti");
  var pool = engine.pools[poolKey];
  var colors = poolKey === "smoke" ? SMOKE_COLORS : (poolKey === "spark" ? SPARK_COLORS : CONFETTI_COLORS);
  var n = Math.min(48, count || 24);
  for (var k = 0; k < n; k += 1) {
    var i = pool.next;
    pool.next = (pool.next + 1) % pool.cap;
    pool.px[i] = x;
    pool.py[i] = y;
    pool.pz[i] = z;
    if (poolKey === "smoke") {
      pool.vx[i] = (Math.random() - 0.5) * 0.42;
      pool.vy[i] = 0.65 + Math.random() * 0.65;
      pool.vz[i] = (Math.random() - 0.5) * 0.35;
      pool.gravity[i] = -0.3;
      pool.size[i] = 0.055 + Math.random() * 0.04;
      pool.maxLife[i] = 0.95 + Math.random() * 0.45;
    } else if (poolKey === "spark") {
      var th = Math.random() * Math.PI * 2;
      var ph = Math.acos(2 * Math.random() - 1);
      var sp = 1.2 + Math.random() * 0.9;
      pool.vx[i] = Math.sin(ph) * Math.cos(th) * sp;
      pool.vy[i] = Math.cos(ph) * sp + 0.3;
      pool.vz[i] = Math.sin(ph) * Math.sin(th) * sp * 0.6;
      pool.gravity[i] = 1.1;
      pool.size[i] = 0.035 + Math.random() * 0.03;
      pool.maxLife[i] = 0.9 + Math.random() * 0.5;
    } else {
      pool.vx[i] = (Math.random() - 0.5) * 2.8;
      pool.vy[i] = 1.5 + Math.random() * 2.4;
      pool.vz[i] = (Math.random() - 0.5) * 2.2;
      pool.gravity[i] = 4.2;
      pool.size[i] = 0.042 + Math.random() * 0.032;
      pool.maxLife[i] = 0.85 + Math.random() * 0.5;
    }
    pool.rx[i] = Math.random() * Math.PI;
    pool.ry[i] = Math.random() * Math.PI;
    pool.spinX[i] = (Math.random() - 0.5) * 8;
    pool.spinY[i] = (Math.random() - 0.5) * 8;
    pool.life[i] = 0;
    pool.mesh.setColorAt(i, engine.tmpColor.setHex(colors[(k + i) % colors.length]));
  }
  if (pool.mesh.instanceColor) {
    pool.mesh.instanceColor.needsUpdate = true;
  }
  pool.active += n;
}

function updateParticlePools(dt) {
  if (!engine.pools) {
    return 0;
  }
  var total = 0;
  var obj = engine.tmpObj;
  var keys = ["confetti", "spark", "smoke"];
  for (var kI = 0; kI < keys.length; kI += 1) {
    var pool = engine.pools[keys[kI]];
    if (pool.active <= 0) {
      continue;
    }
    var alive = 0;
    for (var i = 0; i < pool.cap; i += 1) {
      if (pool.maxLife[i] <= 0) {
        continue;
      }
      pool.life[i] += dt;
      if (pool.life[i] >= pool.maxLife[i]) {
        pool.maxLife[i] = 0;
        pool.mesh.setMatrixAt(i, engine.zeroMatrix);
        continue;
      }
      var lr = pool.life[i] / pool.maxLife[i];
      pool.vy[i] -= pool.gravity[i] * dt;
      if (pool.kind === "spark") {
        pool.vx[i] *= 1 - dt * 1.4;
        pool.vz[i] *= 1 - dt * 1.4;
      }
      pool.px[i] += pool.vx[i] * dt;
      pool.py[i] += pool.vy[i] * dt;
      pool.pz[i] += pool.vz[i] * dt;
      pool.rx[i] += pool.spinX[i] * dt;
      pool.ry[i] += pool.spinY[i] * dt;
      var s;
      if (pool.kind === "smoke") {
        s = pool.size[i] * (0.6 + lr * 1.4) * (1 - lr * 0.75);
      } else if (pool.kind === "spark") {
        s = pool.size[i] * Math.pow(1 - lr, 0.6) * (0.8 + 0.4 * Math.sin(pool.life[i] * 30 + i));
      } else {
        s = pool.size[i] * (1 - smoothstep(0.6, 1, lr));
      }
      obj.position.set(pool.px[i], pool.py[i], pool.pz[i]);
      obj.rotation.set(pool.rx[i], pool.ry[i], 0);
      obj.scale.setScalar(Math.max(0.0001, s));
      obj.updateMatrix();
      pool.mesh.setMatrixAt(i, obj.matrix);
      alive += 1;
    }
    pool.active = alive;
    pool.mesh.instanceMatrix.needsUpdate = true;
    total += alive;
  }
  return total;
}

/* ======================== 页面构建与三段翻页主控 ======================== */

function applySpreadTextures(spTex) {
  engine.leftWallMat.map = spTex.leftWallTex;
  engine.leftWallMat.needsUpdate = true;
  engine.rightWallMat.map = spTex.rightWallTex;
  engine.rightWallMat.needsUpdate = true;
  var deferSide = engine.isFlipping && engine.flipAnim ? (engine.flipAnim.dir === "next" ? "left" : "right") : null;
  engine.deferredFloor = null;
  if (deferSide === "left") {
    engine.deferredFloor = { side: "left", tex: spTex.leftFloorTex };
  } else {
    engine.leftFloorMat.map = spTex.leftFloorTex;
    engine.leftFloorMat.needsUpdate = true;
  }
  if (deferSide === "right") {
    engine.deferredFloor = { side: "right", tex: spTex.rightFloorTex };
  } else {
    engine.rightFloorMat.map = spTex.rightFloorTex;
    engine.rightFloorMat.needsUpdate = true;
  }
}

function flushDeferredFloor() {
  var d = engine.deferredFloor;
  if (!d) {
    return;
  }
  var mat = d.side === "left" ? engine.leftFloorMat : engine.rightFloorMat;
  mat.map = d.tex;
  mat.needsUpdate = true;
  engine.deferredFloor = null;
}

function buildPageContents(pageNum, pageState, startFolded) {
  engine.currentPage = pageNum;
  engine.hasBuilt = true;
  engine.pageStateRef = pageState || {};
  engine.buildToken += 1;
  var token = engine.buildToken;
  engine.popAnim = null;
  clearCurrentDiorama();
  updateBookStackHeight(pageNum);
  applyTheme(pageNum === 8);

  var pageData = getPageData(pageNum);
  if (!pageData) {
    return Promise.resolve();
  }

  // 新页内容先以「收起」态挂载，避免出现一帧完全立起的闪烁
  setCurrentDioramaFoldFactor(1);

  var spreadProm = getOrLoadSpread(pageNum).then(function (spTex) {
    if (token !== engine.buildToken) {
      return;
    }
    applySpreadTextures(spTex);
  }).catch(function (err) {
    console.warn("KikiPopup3D spread load failed:", err);
  });
  applyTheme(engine.bookState !== "closed" && pageNum === 8);

  var actors = pageData.actors || [];
  var actorProms = [];
  for (var ai = 0; ai < actors.length; ai += 1) {
    actorProms.push(addStandeeActor(pageNum, actors[ai], ai, actors.length, pageState, token).catch(function (err) {
      console.warn("KikiPopup3D standee load failed:", err);
    }));
  }

  return Promise.all([spreadProm].concat(actorProms)).then(function () {
    if (token !== engine.buildToken) {
      return;
    }
    if (pageNum === 1) {
      buildP1Decorations();
    } else if (pageNum === 3) {
      buildP3Balloons(pageData);
    } else if (pageNum === 4) {
      buildP4Badges(pageState);
    } else if (pageNum === 5) {
      buildP5LegoBricks(pageData, pageState);
      buildP5LegoCar();
    } else if (pageNum === 6) {
      buildP6PartyLights(pageState);
      buildP6TreasureStage(pageState);
    } else if (pageNum === 8) {
      buildP8NightSkyHotspot();
    }

    if (engine.bookState === "closed") {
      setCurrentDioramaFoldFactor(1);
    } else if (engine.bookState === "opening") {
      if (engine.bookOpenFactor < 0.52) {
        setCurrentDioramaFoldFactor(1);
      } else {
        setCurrentDioramaPopUpProgress((engine.bookOpenFactor - 0.52) / 0.48);
      }
    } else if (engine.isFlipping && engine.flipAnim) {
      if (!engine.flipAnim.popStarted) {
        setCurrentDioramaFoldFactor(1);
      }
      // 若已进入弹起阶段，下一帧由 updateFlipAnimation 统一驱动
    } else if (engine.bookState === "open") {
      // 首次入场 / 跳页：后墙 + 道具弹起；若翻页已结束才加载完成，则后墙保持立起只弹道具
      engine.popAnim = { startTs: performance.now(), duration: ENTRANCE_POP_MS, skipWalls: Boolean(startFolded) };
      setCurrentDioramaPopUpProgress(0, engine.popAnim.skipWalls);
    }

    if (!engine.isFlipping) {
      evictFarSpreads(pageNum);
      scheduleAdjacentPreload(pageNum);
    }
  });
}

function applyTheme(isNight) {
  engine.isNight = Boolean(isNight);
  if (!engine.scene) {
    return;
  }
  if (engine.isNight) {
    engine.scene.background.setHex(0x16102d);
    if (engine.scene.fog) {
      engine.scene.fog.color.setHex(0x16102d);
    }
    if (engine.wallMesh && engine.nightWallTex) {
      engine.wallMesh.material.map = engine.nightWallTex;
      engine.wallMesh.material.needsUpdate = true;
    }
    if (engine.ambLight) {
      engine.ambLight.intensity = 0.72;
    }
    if (engine.hemiLight) {
      engine.hemiLight.intensity = 0.62;
    }
    if (engine.keyLight) {
      engine.keyLight.intensity = 1.05;
      engine.keyLight.color.setHex(0xd6d2ff);
    }
    if (engine.lampLight) {
      engine.lampLight.intensity = 8.4;
    }
    if (engine.lampShadeMat) {
      engine.lampShadeMat.emissiveIntensity = 1.18;
    }
  } else {
    engine.scene.background.setHex(0xf3dec4);
    if (engine.scene.fog) {
      engine.scene.fog.color.setHex(0xf3dec4);
    }
    if (engine.wallMesh && engine.dayWallTex) {
      engine.wallMesh.material.map = engine.dayWallTex;
      engine.wallMesh.material.needsUpdate = true;
    }
    if (engine.ambLight) {
      engine.ambLight.intensity = 1.0;
    }
    if (engine.hemiLight) {
      engine.hemiLight.intensity = 0.82;
    }
    if (engine.keyLight) {
      engine.keyLight.intensity = 1.45;
      engine.keyLight.color.setHex(0xfff3de);
    }
    if (engine.lampLight) {
      engine.lampLight.intensity = 5.4;
    }
    if (engine.lampShadeMat) {
      engine.lampShadeMat.emissiveIntensity = 0.68;
    }
  }
}

/* ======================== 每帧主循环 ======================== */

function updateFlipAnimation(nowTs) {
  var anim = engine.flipAnim;
  if (!anim) {
    return;
  }
  var p = clamp((nowTs - anim.startTs) / anim.duration, 0, 1);

  // 阶段 1 [0, 0.30]：后墙向书脊后方折倒收缩 + 所有立牌/道具同时收起
  if (!anim.midpointFired) {
    setCurrentDioramaFoldFactor(p / FLIP_FOLD_END);
    if (p >= FLIP_FOLD_END) {
      anim.midpointFired = true;
      setCurrentDioramaFoldFactor(1);
      if (anim.onMidpoint) {
        anim.onMidpoint();
      }
      buildPageContents(anim.toPage, anim.pageState, true);
      engine.turnPivot.visible = true;
    }
  }

  // 阶段 2 [0.30, 0.74]：抬高的真 3D 弧面纸页翻过书脊（此时舞台已完全收起，零穿模）
  if (anim.midpointFired) {
    var turnT = clamp((p - FLIP_TURN_START) / (FLIP_TURN_END - FLIP_TURN_START), 0, 1);
    if (turnT < 1) {
      var mapped = anim.dir === "next" ? easeInOutCubic(turnT) : 1 - easeInOutCubic(turnT);
      updateTurningPageDeform(mapped);
      engine.turnPivot.visible = true;
    } else if (engine.turnPivot.visible) {
      engine.turnPivot.visible = false;
      flushDeferredFloor();
    }

    // 阶段 3 [0.75, 1.00]：后墙先立起，再从左到右 easeOutBack 依次弹出
    if (p >= FLIP_POP_START) {
      anim.popStarted = true;
      setCurrentDioramaPopUpProgress((p - FLIP_POP_START) / (1 - FLIP_POP_START));
    }
  }

  if (p >= 1) {
    engine.turnPivot.visible = false;
    flushDeferredFloor();
    setCurrentDioramaPopUpProgress(1);
    engine.flipAnim = null;
    engine.isFlipping = false;
    engine.turnMat.map = engine.creamPaperTex;
    engine.turnBackMat.map = engine.creamPaperTex;
    engine.turnMat.needsUpdate = true;
    engine.turnBackMat.needsUpdate = true;
    for (var wi = 0; wi < engine.standeeList.length; wi += 1) {
      engine.standeeList[wi].nextWanderTs = nowTs + 900 + wi * 520 + Math.random() * 1200;
    }
    updateCornerVisibility();
    evictFarSpreads(engine.currentPage);
    scheduleAdjacentPreload(engine.currentPage);
    if (anim.onComplete) {
      anim.onComplete();
    }
  }
}

function setActorFacing(actorSt, dir, ts) {
  var sign = dir >= 0 ? 1 : -1;
  if (sign !== actorSt.facing && ts - (actorSt.facingChangeTs || 0) >= 320) {
    actorSt.prevFacing = actorSt.facing;
    actorSt.facing = sign;
    actorSt.facingChangeTs = ts;
    actorSt.turnAnim = { startTs: ts, duration: 160 };
  }
}

function landP2DeliveryNow(ts) {
  var dl = engine.p2Delivery;
  var pc = engine.p2Parcel;
  if (!dl || !pc) {
    return;
  }
  dl.active = false;
  dl.phase = "landed";
  dl.jettReleaseTs = ts;
  if (pc.slingGroup) {
    pc.slingGroup.visible = false;
  }
  pc.group.position.set(dl.targetX, dl.targetY, dl.targetZ);
  if (pc.groundShadow) {
    pc.groundShadow.position.set(dl.targetX, dl.targetY + 0.004, dl.targetZ + 0.04);
    pc.groundShadow.scale.set(pc.shadowBaseW, pc.shadowBaseH, 1);
    pc.groundShadow.material.opacity = 0.5;
  }
  pc.landingBounceUntil = ts + 460;
  spawnParticleBurst3D(dl.targetX, dl.targetY + 0.35, dl.targetZ, 22, "confetti");
  spawnParticleBurst3D(dl.targetX, dl.targetY + 0.45, dl.targetZ, 12, "firework");
  if (window.Sfx && typeof window.Sfx.playPop === "function") {
    window.Sfx.playPop(1);
  }
}

function updateStandees(t, ts, dt) {
  var canMove = engine.bookState === "open" && !engine.isFlipping && !engine.popAnim;
  var dl = engine.p2Delivery;
  if (canMove && dl && dl.active && dl.phase === "waiting") {
    dl.phase = "flying";
    dl.startTs = ts;
  }
  if (canMove && dl && dl.active && dl.phase === "flying") {
    var dpMove = clamp((ts - dl.startTs) / dl.duration, 0, 1);
    if (dpMove >= 0.52 && !dl.kikiGreeted) {
      dl.kikiGreeted = true;
      var k2Greet = engine.standees["p2-kiki"];
      if (k2Greet && !k2Greet.isUserCommanded) {
        commandActorMove(k2Greet, dl.targetX - 0.88, dl.targetZ + 0.22, false);
        k2Greet.walkSpeed = 1.25;
      }
    }
  }

  var movableGround = [];
  var kikiCurX = null;
  var kikiCurZ = null;
  for (var ki = 0; ki < engine.standeeList.length; ki += 1) {
    if (engine.standeeList[ki].config.role === "kiki") {
      kikiCurX = engine.standeeList[ki].curX;
      kikiCurZ = engine.standeeList[ki].curZ;
      break;
    }
  }

  // 1. 自主漫步调度 & 速度积分
  for (var i = 0; i < engine.standeeList.length; i += 1) {
    var st = engine.standeeList[i];
    if (st.movable) {
      movableGround.push(st);
    }
    if (!st.movable || !canMove) {
      continue;
    }
    if (st.orbitBurst) {
      var ob = st.orbitBurst;
      var op = clamp((ts - ob.startTs) / ob.duration, 0, 1);
      var prevX = st.curX;
      if (ob.kind === "chase-dash") {
        var ang = op * Math.PI * 2;
        var nextPt = clampWalkTarget(ob.originX + Math.sin(ang) * 1.15, ob.originZ + (1 - Math.cos(ang)) * 0.45);
        st.curX = nextPt.x;
        st.curZ = nextPt.z;
        if (Math.random() < dt * 18) {
          spawnParticleBurst3D(st.curX, pageSurfaceY(st.curX) + 0.1, st.curZ, 2, "firework");
        }
      } else if (ob.kind === "skye-soar") {
        var sAng = op * Math.PI * 2;
        st.curX = clamp(ob.originX + Math.sin(sAng) * 1.35, -2.65, 2.65);
        st.curZ = clamp(ob.originZ - Math.sin(op * Math.PI) * 0.72, -1.2, 1.35);
      } else if (ob.kind === "marshall-flip") {
        var mShift = Math.sin(op * Math.PI) * 0.48;
        var mPt = clampWalkTarget(ob.originX + mShift, ob.originZ + Math.sin(op * Math.PI) * 0.25);
        st.curX = mPt.x;
        st.curZ = mPt.z;
      }
      var vxOb = st.curX - prevX;
      if (Math.abs(vxOb) > 0.008) {
        setActorFacing(st, vxOb, ts);
      }
      if (op >= 1) {
        st.orbitBurst = null;
        var settled = clampWalkTarget(st.curX, st.curZ);
        st.curX = settled.x;
        st.curZ = settled.z;
        st.targetX = st.curX;
        st.targetZ = st.curZ;
        st.nextWanderTs = ts + 2200 + Math.random() * 1800;
      }
      continue;
    }

    if (!st.isWalking && ts >= st.nextWanderTs) {
      var groundCount = 0;
      for (var gci = 0; gci < engine.standeeList.length; gci += 1) {
        if (engine.standeeList[gci].movable) {
          groundCount += 1;
        }
      }
      var rx = groundCount <= 4 ? 1.15 : 0.55;
      var rz = groundCount <= 4 ? 0.52 : 0.28;
      var rawX = st.homeX + (Math.random() * 2 - 1) * rx;
      var rawZ = st.homeZ + (Math.random() * 2 - 1) * rz;
      commandActorMove(st, rawX, rawZ, false);
    }

    if (st.isWalking) {
      var ddx = st.targetX - st.curX;
      var ddz = st.targetZ - st.curZ;
      var dist = Math.hypot(ddx, ddz);
      if (dist <= 0.04) {
        st.curX = st.targetX;
        st.curZ = st.targetZ;
        var wasCmd = st.isUserCommanded;
        st.isWalking = false;
        st.isUserCommanded = false;
        st.nextWanderTs = ts + (wasCmd ? 3600 : 1800) + Math.random() * 2200;
        if (wasCmd) {
          st.actionBurst = { kind: "jump", startTs: ts, duration: 420 };
        }
      } else {
        var step = Math.min(dist, st.walkSpeed * dt);
        var vx = (ddx / dist) * step;
        var vz = (ddz / dist) * step;
        if (Math.abs(vx) > 0.008 && Math.abs(ddx) > 0.06) {
          setActorFacing(st, vx, ts);
        }
        var stepped = clampWalkTarget(st.curX + vx, st.curZ + vz);
        st.curX = stepped.x;
        st.curZ = stepped.z;
        st.walkCycle += dt * (st.isUserCommanded ? 12.5 : 8.5);
        if (ts - st.lastStepFxTs >= 180) {
          st.lastStepFxTs = ts;
          spawnParticleBurst3D(st.curX, pageSurfaceY(st.curX) + 0.06, st.curZ, 1, "firework");
        }
      }
    }
  }

  // 2. 地面人物间软分离力（互相轻轻让路，避免贴图打架）
  if (canMove && movableGround.length > 1) {
    for (var a = 0; a < movableGround.length; a += 1) {
      var sa = movableGround[a];
      if (sa.orbitBurst) {
        continue;
      }
      for (var b = a + 1; b < movableGround.length; b += 1) {
        var sb = movableGround[b];
        if (sb.orbitBurst) {
          continue;
        }
        var sdx = sa.curX - sb.curX;
        var sdz = sa.curZ - sb.curZ;
        var sd = Math.hypot(sdx, sdz);
        if (sd < 0.56) {
          var push = (0.56 - sd) * Math.min(0.45, dt * 3.2);
          var nx = sd > 0.001 ? sdx / sd : (a % 2 === 0 ? 1 : -1);
          var nz = sd > 0.001 ? sdz / sd : 0.2;
          var pa = clampWalkTarget(sa.curX + nx * push * 0.5, sa.curZ + nz * push * 0.5);
          var pb = clampWalkTarget(sb.curX - nx * push * 0.5, sb.curZ - nz * push * 0.5);
          sa.curX = pa.x;
          sa.curZ = pa.z;
          sb.curX = pb.x;
          sb.curZ = pb.z;
        }
      }
    }
  }

  // 2b. 角色与 P5 巡游乐高积木小车保持安全礼貌距离
  if (canMove && engine.p5Car && movableGround.length > 0) {
    var carSt = engine.p5Car;
    for (var ca = 0; ca < movableGround.length; ca += 1) {
      var sm = movableGround[ca];
      if (sm.orbitBurst) {
        continue;
      }
      var cdx = sm.curX - carSt.curX;
      var cdz = sm.curZ - carSt.curZ;
      var cd = Math.hypot(cdx, cdz);
      if (cd < 0.7) {
        var cpush = (0.7 - cd) * Math.min(0.65, dt * 4.2);
        var cnx = cd > 0.001 ? cdx / cd : (ca % 2 === 0 ? 1 : -1);
        var cnz = cd > 0.001 ? cdz / cd : -1;
        var safePt = clampWalkTarget(sm.curX + cnx * cpush, sm.curZ + cnz * cpush);
        sm.curX = safePt.x;
        sm.curZ = safePt.z;
      }
    }
  }

  // 3. 姿态、朝向饱满翻转、特技、悬停与接触阴影同步
  for (var j = 0; j < engine.standeeList.length; j += 1) {
    var actorSt = engine.standeeList[j];
    var dx = 0;
    var dy = 0;
    var dz = 0;
    var rz = 0;
    var ry = 0;

    if (actorSt.isAir) {
      var dlAir = engine.p2Delivery;
      var pcAir = engine.p2Parcel;
      var lwAir = engine.p6LightWave;
      if (actorSt.config.id === "p2-jett" && dlAir && dlAir.active && dlAir.phase === "flying") {
        var jDp = clamp((ts - dlAir.startTs) / dlAir.duration, 0, 1);
        var jDe = easeInOutCubic(jDp);
        var jBx = dlAir.startX + (dlAir.targetX - dlAir.startX) * jDe;
        var jBz = dlAir.startZ + (dlAir.targetZ - dlAir.startZ) * jDe - Math.sin(jDp * Math.PI) * 0.25;
        var jBy = dlAir.startY + (dlAir.targetY - dlAir.startY) * jDe + Math.sin(jDp * Math.PI) * 0.52;
        dx = jBx - actorSt.baseX;
        dy = jBy + 0.62 - actorSt.baseY;
        dz = jBz - actorSt.baseZ;
        rz = -0.14 * (1 - jDp);
        setActorFacing(actorSt, 1, ts);
        if (canMove && Math.random() < dt * 12) {
          spawnParticleBurst3D(jBx - 0.2, jBy + 0.55, jBz, 1, "confetti");
        }
      } else if (actorSt.config.id === "p2-dizzy" && dlAir && dlAir.active && dlAir.phase === "flying") {
        var dDp = clamp((ts - dlAir.startTs) / dlAir.duration, 0, 1);
        var dDe = easeInOutCubic(dDp);
        var dTargetX = dlAir.startX + (dlAir.targetX - dlAir.startX) * dDe + 0.72;
        var dTargetY = dlAir.startY + (dlAir.targetY - dlAir.startY) * dDe + 0.78 + Math.sin(t * 3.5) * 0.08;
        var dTargetZ = dlAir.startZ + (dlAir.targetZ - dlAir.startZ) * dDe - 0.15;
        dx = dTargetX - actorSt.baseX;
        dy = dTargetY - actorSt.baseY;
        dz = dTargetZ - actorSt.baseZ;
        rz = -0.08;
        setActorFacing(actorSt, -1, ts);
      } else if (pcAir && ts < pcAir.celebrateUntil && kikiCurX !== null) {
        var cAng = t * 2.8 + actorSt.phase * 2.1;
        dx = kikiCurX + Math.cos(cAng) * 0.78 - actorSt.baseX;
        dy = 1.65 + Math.sin(t * 5.2 + actorSt.phase) * 0.14 - actorSt.baseY;
        dz = (kikiCurZ || 0.2) + Math.sin(cAng) * 0.48 - actorSt.baseZ;
        setActorFacing(actorSt, -Math.sin(cAng), ts);
        if (canMove && Math.random() < dt * 9) {
          spawnParticleBurst3D(actorSt.baseX + dx, actorSt.baseY + dy - 0.1, actorSt.baseZ + dz, 1, "confetti");
        }
      } else if (lwAir && lwAir.active && engine.currentPage === 6) {
        var lWp = clamp((ts - lwAir.startTs) / lwAir.duration, 0, 1);
        var isJ6 = actorSt.config.role === "jett";
        var sweepX = isJ6 ? -2.7 + lWp * 5.2 : 2.7 - lWp * 5.2;
        dx = sweepX - actorSt.baseX;
        dy = 2.08 + Math.sin(lWp * Math.PI) * 0.22 - actorSt.baseY;
        dz = -1.18 - actorSt.baseZ;
        rz = isJ6 ? -0.14 : 0.14;
        setActorFacing(actorSt, isJ6 ? 1 : -1, ts);
      } else {
        // 乐迪 & 小爱宽幅 3D 巡航（遇 KIKI 安全区主动拔高，根据水平速度平滑翻转朝向）
        var sideSign = actorSt.config.role === "jett" ? 1 : -1;
        var patrolSpeed = engine.currentPage === 8 ? 0.58 : 0.48;
        var angA = t * patrolSpeed + actorSt.phase;
        dx = Math.sin(angA) * 1.05 * sideSign;
        var vxAir = Math.cos(angA) * patrolSpeed * 1.05 * sideSign;
        if (Math.abs(vxAir) > 0.08) {
          setActorFacing(actorSt, vxAir, ts);
        }
        var worldX = actorSt.baseX + dx;
        var avoidLift = kikiCurX !== null && Math.abs(worldX - kikiCurX) < 0.9 ? 0.38 : 0;
        dy = Math.sin(t * 1.4 + actorSt.phase) * 0.14 + avoidLift;
        dz = Math.cos(t * 0.72 + actorSt.phase) * 0.24;
        rz = Math.cos(angA) * 0.11 - actorSt.facing * 0.04;
        if (actorSt.config.id === "p2-jett" && dlAir && dlAir.jettReleaseTs && ts - dlAir.jettReleaseTs < 950) {
          var relT = easeOutCubic(clamp((ts - dlAir.jettReleaseTs) / 950, 0, 1));
          var lx0 = dlAir.targetX - actorSt.baseX;
          var ly0 = dlAir.targetY + 0.62 - actorSt.baseY;
          var lz0 = dlAir.targetZ - actorSt.baseZ;
          dx = lx0 + (dx - lx0) * relT;
          dy = ly0 + (dy - ly0) * relT;
          dz = lz0 + (dz - lz0) * relT;
        }
        if (canMove && (engine.currentPage === 2 || engine.currentPage === 8) && Math.random() < dt * 6) {
          spawnParticleBurst3D(actorSt.baseX + dx, actorSt.baseY + dy - 0.1, actorSt.baseZ + dz, 1, "confetti");
        }
      }
    } else {
      actorSt.root.position.set(actorSt.curX, actorSt.config.role === "flag" ? actorSt.baseY : pageSurfaceY(actorSt.curX), actorSt.curZ);
      var idleMode = actorSt.config.idle || "";
      if (actorSt.orbitBurst) {
        var ob2 = actorSt.orbitBurst;
        var op2 = clamp((ts - ob2.startTs) / ob2.duration, 0, 1);
        if (ob2.kind === "skye-soar") {
          dy = Math.sin(op2 * Math.PI) * 1.85;
          rz = Math.sin(op2 * Math.PI * 4) * 0.14;
        } else if (ob2.kind === "marshall-flip") {
          dy = Math.sin(op2 * Math.PI) * 0.72;
          ry = op2 * Math.PI * 2;
        } else if (ob2.kind === "chase-dash") {
          dy = Math.abs(Math.sin(op2 * Math.PI * 8)) * 0.08;
          rz = Math.sin(op2 * Math.PI * 8) * 0.1;
        }
      } else if (actorSt.isWalking && canMove) {
        var stepAmp = actorSt.isUserCommanded ? 0.11 : 0.065;
        dy = Math.abs(Math.sin(actorSt.walkCycle)) * stepAmp;
        rz = Math.sin(actorSt.walkCycle) * 0.095;
        ry = actorSt.facing * 0.09;
      } else if (idleMode === "dance" || idleMode === "dance-alt" || idleMode === "dance-lead") {
        rz = Math.sin(t * 3.8 + actorSt.phase) * 0.06;
        dy = Math.abs(Math.sin(t * 3.8 + actorSt.phase)) * 0.06;
      } else if (actorSt.config.role === "kiki") {
        rz = Math.sin(t * 1.6 + actorSt.phase) * 0.02;
        actorSt.mesh.scale.y = 1 + Math.sin(t * 2.2) * 0.012;
      } else {
        rz = Math.sin(t * 1.8 + actorSt.phase) * 0.025;
      }
    }

    // 饱满小跳转身：最窄维持 78% 宽度并在半程干净镜像，绝对不缩成纸片竖条
    var widthScale = 1;
    var dirSign = actorSt.facing >= 0 ? 1 : -1;
    if (actorSt.turnAnim) {
      var tp = clamp((ts - actorSt.turnAnim.startTs) / actorSt.turnAnim.duration, 0, 1);
      widthScale = 1 - 0.22 * Math.sin(tp * Math.PI);
      dirSign = (tp < 0.5 ? actorSt.prevFacing : actorSt.facing) >= 0 ? 1 : -1;
      ry += Math.sin(tp * Math.PI) * 0.24 * dirSign;
      dy += Math.sin(tp * Math.PI) * 0.04;
      if (tp >= 1) {
        actorSt.turnAnim = null;
      }
    }
    actorSt.facingScale = dirSign;
    actorSt.mesh.scale.x = actorSt.baseMeshScaleX * widthScale * dirSign;
    if (actorSt.crownMesh) {
      actorSt.crownMesh.position.x = actorSt.crownBaseX * dirSign;
      actorSt.crownMesh.rotation.z = actorSt.crownBaseRotZ * dirSign;
    }

    var pScale = 1;
    var pScaleY = 1;
    if (actorSt.actionBurst) {
      var bp = clamp((ts - actorSt.actionBurst.startTs) / actorSt.actionBurst.duration, 0, 1);
      var k = actorSt.actionBurst.kind;
      if (k === "jump") {
        dy += Math.sin(bp * Math.PI) * 0.42;
      } else if (k === "flip") {
        dy += Math.sin(bp * Math.PI) * 0.55;
        ry += bp * Math.PI * 2;
      } else if (k === "soar") {
        dy += Math.sin(bp * Math.PI) * 1.45;
        dx += Math.sin(bp * Math.PI * 2) * 0.65;
        dz -= Math.sin(bp * Math.PI) * 0.55;
      } else if (k === "dash") {
        dx += Math.sin(bp * Math.PI * 2) * 0.45;
      } else if (k === "castle-pulse") {
        var cp = Math.sin(bp * Math.PI);
        pScale = 1 + cp * 0.07;
        pScaleY = 1 + cp * 0.13;
      } else if (k === "flag-rise") {
        var fpFlag = easeOutBack(bp);
        dy += -0.35 * (1 - fpFlag);
        ry += Math.sin(bp * Math.PI * 3) * 0.18;
      }
      if (bp >= 1) {
        actorSt.actionBurst = null;
      }
    }

    actorSt.pivot.position.set(dx, dy, dz);
    actorSt.pivot.rotation.set(0, ry, rz);
    actorSt.pivot.scale.set(pScale, pScaleY, pScale);
    var isHovered = engine.hoveredObj && engine.hoveredObj.id === actorSt.config.id;
    actorSt.hoverMix += ((isHovered ? 1 : 0) - actorSt.hoverMix) * 0.18;
    actorSt.pivot.scale.setScalar(1 + actorSt.hoverMix * (actorSt.isAir ? 0.05 : 0.07));

    if (actorSt.contact) {
      var lift = clamp(dy / 0.6, 0, 1);
      var foldMul = typeof actorSt.contact.userData.foldMul === "number" ? actorSt.contact.userData.foldMul : 1;
      actorSt.contact.material.opacity = actorSt.contactBase * foldMul * (1 - lift * 0.65);
      var cs = 1 - lift * 0.35;
      var cx = actorSt.curX + dx;
      var cz = actorSt.curZ + dz + 0.02;
      actorSt.contact.position.set(cx, pageSurfaceY(cx) + 0.004, cz);
      actorSt.contact.scale.x = clamp(actorSt.wWorld * 0.82, 0.28, 1.1) * cs;
    }
  }
}

function updatePageProps(t, ts, dt) {
  var stepDt = typeof dt === "number" ? dt : 0.016;
  var canMove = engine.bookState === "open" && !engine.isFlipping && !engine.popAnim;
  for (var f = 0; f < engine.p1Flowers.length; f += 1) {
    var fl = engine.p1Flowers[f];
    if (ts < fl.bounceUntil) {
      var fbp = 1 - (fl.bounceUntil - ts) / 720;
      var amp = Math.sin(fbp * Math.PI * 3) * (1 - fbp);
      fl.sway.rotation.z = Math.sin(t * 9 + fl.phase) * 0.16 * (1 - fbp);
      fl.sway.scale.set(1 + amp * 0.14, 1 + amp * 0.22, 1);
    } else {
      fl.sway.rotation.z = Math.sin(t * 1.3 + fl.phase) * 0.045;
      fl.sway.scale.set(1, 1, 1);
    }
  }

  var bfFocus = engine.p1ButterflyFocus && ts < engine.p1ButterflyFocus.until ? engine.p1ButterflyFocus : null;
  var bfEase = Math.min(1, stepDt * 3.8);
  for (var b = 0; b < engine.butterflies.length; b += 1) {
    var bf = engine.butterflies[b];
    var flap = 0.25 + Math.sin(t * (bfFocus ? 19 : 15) + bf.phase) * 0.8;
    bf.rw.rotation.z = flap;
    bf.lw.rotation.z = -flap;
    var txOff;
    var tyOff;
    var tzOff;
    if (bfFocus) {
      var angF = t * (2.5 + b * 0.22) + bf.phase;
      var rad = 0.26 + (b % 2) * 0.14;
      txOff = bfFocus.x + Math.cos(angF) * rad - bf.baseX;
      tyOff = bfFocus.y + 0.42 + (b % 3) * 0.14 + Math.sin(t * 3.6 + b) * 0.08 - bf.baseY;
      tzOff = bfFocus.z + Math.sin(angF) * rad * 0.85 - bf.baseZ;
    } else {
      txOff = Math.sin(t * 0.9 + bf.phase) * 0.45;
      tyOff = Math.cos(t * 1.7 + bf.phase) * 0.16;
      tzOff = Math.sin(t * 0.7 + bf.phase * 1.3) * 0.32;
    }
    var nxB = bf.curOffX + (txOff - bf.curOffX) * bfEase;
    var nyB = bf.curOffY + (tyOff - bf.curOffY) * bfEase;
    var nzB = bf.curOffZ + (tzOff - bf.curOffZ) * bfEase;
    bf.curOffX = nxB;
    bf.curOffY = nyB;
    bf.curOffZ = nzB;
    var vxB = nxB - bf.lastX;
    var vzB = nzB - bf.lastZ;
    if (Math.abs(vxB) + Math.abs(vzB) > 0.0001) {
      bf.inner.rotation.y = Math.atan2(-vxB, -vzB);
    }
    bf.inner.rotation.x = 0.25 + Math.sin(t * 15 + bf.phase) * 0.05;
    bf.inner.position.set(nxB, nyB, nzB);
    bf.lastX = nxB;
    bf.lastZ = nzB;
  }

  var pc = engine.p2Parcel;
  var dlP = engine.p2Delivery;
  if (pc && dlP && dlP.active && dlP.phase === "flying" && canMove) {
    var dp2 = clamp((ts - dlP.startTs) / dlP.duration, 0, 1);
    var de2 = easeInOutCubic(dp2);
    var bx2 = dlP.startX + (dlP.targetX - dlP.startX) * de2;
    var bz2 = dlP.startZ + (dlP.targetZ - dlP.startZ) * de2 - Math.sin(dp2 * Math.PI) * 0.25;
    var by2 = dlP.startY + (dlP.targetY - dlP.startY) * de2 + Math.sin(dp2 * Math.PI) * 0.52;
    pc.group.position.set(bx2, by2, bz2);
    if (pc.groundShadow) {
      var liftFrac = clamp((by2 - dlP.targetY) / 2.2, 0, 1);
      var shScale = 1 - liftFrac * 0.6;
      pc.groundShadow.position.set(bx2, pageSurfaceY(bx2) + 0.004, bz2 + 0.04);
      pc.groundShadow.scale.set(pc.shadowBaseW * shScale, pc.shadowBaseH * shScale, 1);
      pc.groundShadow.material.opacity = 0.5 - liftFrac * 0.26;
    }
    if (dp2 >= 1) {
      landP2DeliveryNow(ts);
    }
  }
  if (pc) {
    if (ts < pc.landingBounceUntil) {
      var lbp = 1 - (pc.landingBounceUntil - ts) / 460;
      var lbWave = Math.sin(lbp * Math.PI * 2) * (1 - lbp);
      pc.inner.scale.set(1 + lbWave * 0.12, 1 - lbWave * 0.14, 1 + lbWave * 0.12);
    } else if (pc.inner.scale.y !== 1) {
      pc.inner.scale.set(1, 1, 1);
    }
    pc.lidPivot.rotation.x += (pc.targetLidAngle - pc.lidPivot.rotation.x) * 0.16;
    var targetGlow = pc.opened ? 1.6 : 0;
    if (Math.abs(targetGlow - pc.glowLevel) > 0.005) {
      pc.glowLevel += (targetGlow - pc.glowLevel) * 0.08;
      setPageLightBase(0, pc.glowLevel);
    }
    pc.glowSprite.material.opacity = pc.opened ? 0.7 + Math.sin(t * 3.2) * 0.15 : 0;
    var fa = pc.flightAnim;
    if (fa) {
      if (fa.kikiSt) {
        var ds = (fa.kikiSt.facingScale || 1) >= 0 ? 1 : -1;
        var ox = fa.kikiSt.crownMesh ? fa.kikiSt.crownBaseX * ds : 0;
        var oy = fa.kikiSt.crownMesh ? fa.kikiSt.crownMesh.position.y : fa.kikiSt.hWorld * 0.91;
        fa.endP.set(fa.kikiSt.curX + ox, pageSurfaceY(fa.kikiSt.curX) + oy, fa.kikiSt.curZ);
      }
      var fp = clamp((ts - fa.startTs) / fa.duration, 0, 1);
      var fe = easeInOutCubic(fp);
      pc.flyingCrown.position.set(
        quadBezier(fa.startP.x, fa.ctrl.x, fa.endP.x, fe),
        quadBezier(fa.startP.y, fa.ctrl.y, fa.endP.y, fe),
        quadBezier(fa.startP.z, fa.ctrl.z, fa.endP.z, fe)
      );
      pc.flyingCrown.rotation.y = fp * Math.PI * 4;
      pc.flyingCrown.scale.setScalar(fa.startScale + (fa.endScale - fa.startScale) * fe);
      if (fp >= 1) {
        pc.flyingCrown.visible = false;
        pc.flightAnim = null;
        if (fa.kikiSt && fa.kikiSt.crownMesh) {
          fa.kikiSt.crownMesh.visible = true;
          setKikiSpriteState(fa.kikiSt, true);
          fa.kikiSt.actionBurst = { kind: "jump", startTs: ts, duration: 750 };
          spawnParticleBurst3D(fa.endP.x, fa.endP.y, fa.endP.z, 22, "confetti");
          spawnParticleBurst3D(fa.endP.x, fa.endP.y + 0.1, fa.endP.z, 16, "firework");
        }
      }
    }
  }

  for (var bi = 0; bi < engine.p3Balloons.length; bi += 1) {
    var bl = engine.p3Balloons[bi];
    if (canMove && engine.currentPage === 3) {
      bl.vy -= 0.36 * stepDt;
      var drag = Math.pow(0.92, stepDt * 10);
      bl.vx *= drag;
      bl.vz *= drag;
      bl.curX += bl.vx * stepDt;
      bl.curY += bl.vy * stepDt;
      bl.curZ += bl.vz * stepDt;
      if (bl.curX < -2.45) {
        bl.curX = -2.45;
        bl.vx = Math.abs(bl.vx) + 0.16;
      } else if (bl.curX > 2.45) {
        bl.curX = 2.45;
        bl.vx = -Math.abs(bl.vx) - 0.16;
      }
      if (bl.curZ < -0.86) {
        bl.curZ = -0.86;
        bl.vz = Math.abs(bl.vz) + 0.08;
      } else if (bl.curZ > 0.92) {
        bl.curZ = 0.92;
        bl.vz = -Math.abs(bl.vz) - 0.08;
      }
      if (bl.curY > 2.38) {
        bl.curY = 2.38;
        bl.vy = -Math.abs(bl.vy) * 0.55;
      }
      if (bl.curY < 1.32 && bl.vy < 0.06 && ts - bl.lastHitTs > 820) {
        var catcher = findNearestMovable(bl.curX, bl.curZ);
        if (catcher) {
          var cDist = Math.hypot(catcher.curX - bl.curX, catcher.curZ - bl.curZ);
          if (cDist > 0.54) {
            commandActorMove(catcher, bl.curX, clamp(bl.curZ + 0.14, -0.82, 1.02), false);
            catcher.walkSpeed = 1.68;
          }
          if (cDist <= 0.62 || bl.curY <= 0.9) {
            bl.vy = 1.08 + Math.random() * 0.28;
            bl.vx += (Math.random() - 0.5) * 0.62;
            bl.vz += (Math.random() - 0.5) * 0.34;
            bl.curY = Math.max(bl.curY, 0.92);
            bl.lastHitTs = ts;
            bl.squishUntil = ts + 420;
            bl.bounceEnd = ts + 420;
            catcher.actionBurst = { kind: "jump", startTs: ts, duration: 500 };
            setActorFacing(catcher, bl.curX - catcher.curX, ts);
            spawnParticleBurst3D(bl.curX, bl.curY - 0.15, bl.curZ, 8, "confetti");
          }
        }
      }
      if (bl.curY < 0.85) {
        bl.curY = 0.85;
        bl.vy = 1.1;
        bl.lastHitTs = ts;
        bl.squishUntil = ts + 420;
      }
      bl.root.position.set(bl.curX, bl.curY, bl.curZ);
    }
    var bSquish = ts < bl.squishUntil ? Math.sin((1 - (bl.squishUntil - ts) / 420) * Math.PI) : 0;
    bl.group.scale.set(1 + bSquish * 0.16, 1 - bSquish * 0.16, 1 + bSquish * 0.16);
    bl.group.position.set(Math.sin(t * 1.4 + bl.phase) * 0.04, Math.sin(t * 2.1 + bl.phase) * 0.03, 0);
    bl.group.rotation.z = clamp(-bl.vx * 0.18, -0.22, 0.22) + Math.sin(t * 1.3 + bl.phase) * 0.04;
  }

  if (engine.p4Badges.length > 0 && canMove) {
    var k4 = engine.standees["p4-kiki"];
    var k4x = k4 ? k4.curX : -1.45;
    var k4z = k4 ? k4.curZ : 0.42;
    var k4y = pageSurfaceY(k4x) + 1.05;
    for (var pbi = 0; pbi < engine.p4Badges.length; pbi += 1) {
      var bg = engine.p4Badges[pbi];
      if (bg.mode === "flying" && bg.flight) {
        var bgp = clamp((ts - bg.flight.startTs) / bg.flight.duration, 0, 1);
        var bge = easeInOutCubic(bgp);
        var oAngF = bg.orbitAngle + t * 0.9;
        var dstX = k4x + Math.cos(oAngF) * 0.56;
        var dstY = k4y + Math.sin(t * 2.5 + bg.phase) * 0.06;
        var dstZ = k4z + Math.sin(oAngF) * 0.34;
        bg.curX = quadBezier(bg.flight.sx, (bg.flight.sx + dstX) * 0.5, dstX, bge);
        bg.curY = quadBezier(bg.flight.sy, Math.max(bg.flight.sy, dstY) + 0.95, dstY, bge);
        bg.curZ = quadBezier(bg.flight.sz, (bg.flight.sz + dstZ) * 0.5 + 0.25, dstZ, bge);
        bg.inner.rotation.y = bgp * Math.PI * 4;
        if (bgp >= 1) {
          bg.mode = "orbit";
          bg.flight = null;
          spawnParticleBurst3D(bg.curX, bg.curY, bg.curZ, 12, "confetti");
        }
      } else if (bg.mode === "orbit") {
        var oA = bg.orbitAngle + t * 0.9;
        bg.curX = k4x + Math.cos(oA) * 0.56;
        bg.curY = k4y + Math.sin(t * 2.6 + bg.phase) * 0.07;
        bg.curZ = k4z + Math.sin(oA) * 0.34;
        bg.inner.rotation.y = t * 1.8 + bg.phase;
      } else {
        var pup = engine.standees[bg.actorId];
        var sideShift = pbi === 2 ? -0.44 : 0.42;
        bg.hoverX = pup ? pup.curX + sideShift : bg.hoverX;
        bg.hoverZ = pup ? pup.curZ + 0.12 : bg.hoverZ;
        bg.curX += (bg.hoverX - bg.curX) * Math.min(1, stepDt * 6);
        bg.curY += (bg.hoverY + Math.sin(t * 2.4 + bg.phase) * 0.06 - bg.curY) * Math.min(1, stepDt * 6);
        bg.curZ += (bg.hoverZ - bg.curZ) * Math.min(1, stepDt * 6);
        bg.inner.rotation.y = Math.sin(t * 1.4 + bg.phase) * 0.35;
      }
      bg.root.position.set(bg.curX, bg.curY, bg.curZ);
    }
  }

  for (var ri = 0; ri < engine.p5Bricks.length; ri += 1) {
    var br = engine.p5Bricks[ri];
    if (br.flying) {
      var bp2 = clamp((ts - br.flying.startTs) / 560, 0, 1);
      var be = easeOutCubic(bp2);
      br.group.position.set((br.flying.tx - br.baseX) * be, Math.sin(bp2 * Math.PI) * 1.45, (br.flying.tz - br.baseZ) * be);
      br.group.rotation.y = bp2 * Math.PI * 2;
      if (bp2 >= 1) {
        br.root.visible = false;
        br.group.position.set(0, 0, 0);
        br.group.rotation.y = 0;
        br.flying = null;
        spawnParticleBurst3D(0.96, 1.25, -1.06, 16, "confetti");
        var castleSt = engine.standees["p5-castle"];
        if (castleSt) {
          castleSt.actionBurst = { kind: "castle-pulse", startTs: ts, duration: 540 };
        }
        if (engine.p5Car) {
          engine.p5Car.boostUntil = Math.max(engine.p5Car.boostUntil, ts + 1000);
        }
      }
    }
  }

  var car = engine.p5Car;
  if (car) {
    var carActive = engine.bookState === "open" && !engine.isFlipping && !engine.popAnim;
    var boosting = ts < car.boostUntil;
    if (carActive) {
      var angSpeed = boosting ? 1.45 : 0.62;
      car.angle += stepDt * angSpeed;
      var nx = car.centerX + Math.cos(car.angle) * car.rx;
      var nz = car.centerZ + Math.sin(car.angle) * car.rz;
      var vx = nx - car.curX;
      var vz = nz - car.curZ;
      var dist = Math.hypot(vx, vz);
      car.curX = nx;
      car.curZ = nz;
      if (dist > 0.0002) {
        car.yaw = Math.atan2(vx, vz);
        car.wheelSpin += dist / car.wheelRadius;
      }
      var hopY = 0;
      if (car.hopStartTs && ts - car.hopStartTs < 380) {
        hopY = Math.sin(((ts - car.hopStartTs) / 380) * Math.PI) * 0.14;
      }
      var bobY = hopY + Math.abs(Math.sin(t * (boosting ? 18 : 9))) * 0.006;
      car.group.position.set(nx, pageSurfaceY(nx) + bobY, nz);
      car.inner.rotation.y = car.yaw;
      for (var w = 0; w < car.wheels.length; w += 1) {
        car.wheels[w].rotation.x = car.wheelSpin;
      }
      if (car.contact) {
        car.contact.position.set(nx, pageSurfaceY(nx) + 0.004, nz);
        car.contact.rotation.y = car.yaw;
      }
      car.headLightMat.emissiveIntensity = boosting ? 2.4 : 0.95;
      if (boosting && ts - car.lastSparkTs >= 90) {
        car.lastSparkTs = ts;
        var exX = nx - Math.sin(car.yaw) * 0.34;
        var exZ = nz - Math.cos(car.yaw) * 0.34;
        spawnParticleBurst3D(exX, pageSurfaceY(exX) + 0.16, exZ, 2, "confetti");
      }
    }
  }

  var L = engine.p6Lights;
  var lw = engine.p6LightWave;
  if (L && lw && lw.active) {
    var wp6 = clamp((ts - lw.startTs) / lw.duration, 0, 1);
    var upTo = Math.min(L.bulbs.length - 1, Math.floor(wp6 * L.bulbs.length));
    for (var bi6 = lw.litIdx + 1; bi6 <= upTo; bi6 += 1) {
      var bb6 = L.bulbs[bi6];
      bb6.glass.material = L.glassOn[bb6.palette];
      bb6.fil.visible = true;
      bb6.halo.visible = true;
      var wPos6 = new THREE.Vector3();
      bb6.glass.getWorldPosition(wPos6);
      engine.dioramaGroup.worldToLocal(wPos6);
      spawnParticleBurst3D(wPos6.x, wPos6.y, wPos6.z, 3, "firework");
    }
    lw.litIdx = upTo;
    setPageLightBase(1, wp6 * 3.2);
    if (wp6 >= 1) {
      lw.active = false;
      setP6Lights(true);
      spawnParticleBurst3D(0, 2.3, -1.6, 26, "firework");
      spawnParticleBurst3D(0, 1.3, -0.18, 16, "confetti");
      for (var si6 = 0; si6 < engine.standeeList.length; si6 += 1) {
        var st6 = engine.standeeList[si6];
        if (!st6.isAir && st6.movable) {
          st6.actionBurst = { kind: "jump", startTs: ts + si6 * 35, duration: 580 };
        }
      }
    }
  }
  if (L && L.on) {
    for (var li = 0; li < L.bulbs.length; li += 1) {
      var bb = L.bulbs[li];
      var tw = 0.28 + Math.sin(t * 2.6 + bb.phase) * 0.06 + Math.max(0, Math.sin(t * 5.3 + bb.phase * 2.1)) * 0.08;
      bb.halo.scale.set(tw, tw, 1);
    }
  }

  var p6s = engine.p6TreasureStage;
  if (p6s) {
    p6s.crystal.rotation.y = t * 1.1;
    p6s.crystal.position.y = 0.5 + Math.sin(t * 2.2) * 0.025;
    var boostStage = L && L.on ? 0.25 : 0;
    for (var tsIdx = 0; tsIdx < p6s.items.length; tsIdx += 1) {
      var it6 = p6s.items[tsIdx];
      var unl6 = Boolean(engine.unlockedMap[it6.id]);
      it6.wrap.rotation.y = unl6 ? t * 1.35 + it6.phase : Math.sin(t * 0.7 + it6.phase) * 0.2;
      it6.wrap.position.y = it6.baseY + (unl6 ? 0.04 + Math.sin(t * 2.5 + it6.phase) * 0.028 : 0);
      var emv = unl6 ? 0.45 + boostStage + 0.15 * Math.sin(t * 3 + it6.phase) : 0.05 + boostStage * 0.35;
      for (var m6 = 0; m6 < it6.mats.length; m6 += 1) {
        it6.mats[m6].emissiveIntensity = emv;
      }
    }
  }

  for (var tri = 0; tri < engine.p7Treats.length; tri += 1) {
    var tr7 = engine.p7Treats[tri];
    if (ts < tr7.bounceUntil) {
      var tp7 = 1 - (tr7.bounceUntil - ts) / 480;
      var tw7 = Math.sin(tp7 * Math.PI * 2) * (1 - tp7);
      tr7.inner.scale.set(1 + tw7 * 0.16, 1 - tw7 * 0.14, 1 + tw7 * 0.16);
      tr7.inner.position.y = Math.max(0, Math.sin(tp7 * Math.PI) * 0.09);
    } else if (tr7.inner.scale.y !== 1 || tr7.inner.position.y !== 0) {
      tr7.inner.scale.set(1, 1, 1);
      tr7.inner.position.y = 0;
    }
  }

  for (var tfi = 0; tfi < engine.p7TeaFlames.length; tfi += 1) {
    var tf7 = engine.p7TeaFlames[tfi];
    var f7 = 0.88 + Math.sin(t * 14 + tf7.phase) * 0.14;
    tf7.flame.scale.set(1, f7, 1);
    tf7.halo.scale.setScalar(0.22 + Math.sin(t * 11 + tf7.phase) * 0.03);
  }

  if (engine.p7Candles.length > 0) {
    for (var ci = 0; ci < engine.p7Candles.length; ci += 1) {
      var cd = engine.p7Candles[ci];
      if (cd.lit) {
        var fScale = 0.9 + Math.sin(t * 16 + cd.phase) * 0.12;
        cd.flame.scale.set(1 - (fScale - 1) * 0.5, fScale, 1 - (fScale - 1) * 0.5);
        cd.flame.rotation.z = Math.sin(t * 11 + cd.phase) * 0.12;
        var hs = 0.22 + Math.sin(t * 13 + cd.phase) * 0.025;
        cd.halo.scale.set(hs, hs * 1.25, 1);
      }
    }
  }
  if (engine.p7Cloud) {
    var ba7 = engine.p7BlowAnim;
    if (ba7 && ba7.active) {
      var bp7 = clamp((ts - ba7.startTs) / ba7.duration, 0, 1);
      var flyIn = smoothstep(0, 0.28, bp7);
      var cl7 = engine.p7Cloud;
      cl7.group.position.set(
        cl7.baseX + (cl7.blowTargetX - cl7.baseX) * flyIn,
        cl7.baseY + (cl7.blowTargetY - cl7.baseY) * flyIn,
        cl7.baseZ + (cl7.blowTargetZ - cl7.baseZ) * flyIn
      );
      cl7.inner.scale.setScalar(1 + Math.sin(bp7 * Math.PI * 2) * 0.22);
      if (bp7 >= 0.2 && bp7 <= 0.94 && Math.random() < stepDt * 24) {
        spawnParticleBurst3D(cl7.group.position.x - 0.18, cl7.group.position.y - 0.06, cl7.group.position.z - 0.12, 1, "smoke");
      }
      if (bp7 >= 0.22) {
        var cWave = clamp((bp7 - 0.22) / 0.72, 0, 1);
        var extCount = Math.min(engine.p7Candles.length, Math.floor(cWave * engine.p7Candles.length) + 1);
        for (var eci = 0; eci < extCount; eci += 1) {
          var revIdx = engine.p7Candles.length - 1 - eci;
          var ecd = engine.p7Candles[revIdx];
          if (ecd && ecd.lit) {
            setCandleLit(ecd, false);
            spawnParticleBurst3D(ecd.worldPos.x, ecd.worldPos.y, ecd.worldPos.z, 10, "smoke");
          }
        }
        refreshCandleLight();
      }
      if (bp7 >= 1) {
        ba7.active = false;
        for (var remi = 0; remi < engine.p7Candles.length; remi += 1) {
          if (engine.p7Candles[remi].lit) {
            setCandleLit(engine.p7Candles[remi], false);
          }
        }
        refreshCandleLight();
        cl7.group.visible = false;
        spawnParticleBurst3D(0.06, 1.35, -0.35, 22, "confetti");
        spawnParticleBurst3D(0.06, 1.45, -0.35, 14, "firework");
        for (var ai7 = 0; ai7 < engine.standeeList.length; ai7 += 1) {
          var ast7 = engine.standeeList[ai7];
          if (ast7.movable) {
            ast7.actionBurst = { kind: "jump", startTs: ts + ai7 * 40, duration: 580 };
          }
        }
      }
    } else {
      var puff = ts < engine.p7Cloud.puffUntil ? 1 + Math.sin(((engine.p7Cloud.puffUntil - ts) / 450) * Math.PI) * 0.28 : 1;
      engine.p7Cloud.inner.scale.setScalar(puff);
      engine.p7Cloud.inner.position.y = Math.sin(t * 2.1) * 0.06;
    }
  }

  if (engine.currentPage === 8 && !engine.isFlipping && ts >= engine.p8Trails.nextFwTs) {
    engine.p8Trails.nextFwTs = ts + 1600 + Math.random() * 800;
    var fwX = Math.random() < 0.5 ? -2.4 + Math.random() * 1.1 : 1.3 + Math.random() * 1.1;
    var fwY = 1.65 + Math.random() * 0.55;
    spawnParticleBurst3D(fwX, fwY, -1.6, 30, "firework");
    spawnParticleBurst3D(fwX, fwY, -1.6, 8, "confetti");
  }
}

function updateSouvenirs(t) {
  var sKeys = Object.keys(engine.souvenirs);
  for (var si = 0; si < sKeys.length; si += 1) {
    var item = engine.souvenirs[sKeys[si]];
    var unlocked = Boolean(engine.unlockedMap[sKeys[si]]);
    var glow;
    if (unlocked) {
      item.group.rotation.y = t * 1.2 + item.phase;
      item.group.position.y = item.baseY + Math.sin(t * 2.4 + item.phase) * 0.055;
      glow = 0.5 + 0.2 * Math.sin(t * 3 + item.phase);
    } else {
      item.group.rotation.y = Math.sin(t * 0.6 + item.phase) * 0.18;
      item.group.position.y = item.baseY;
      glow = 0.06;
    }
    if (Math.abs(glow - item.lastGlow) > 0.01) {
      for (var m = 0; m < item.mats.length; m += 1) {
        item.mats[m].emissiveIntensity = glow;
      }
      item.lastGlow = glow;
    }
  }
}

function animateLoop(nowTs) {
  engine.rafId = null;
  if (!engine.ready || engine.pageHidden) {
    return;
  }
  var ts = nowTs || performance.now();
  var dt = engine.lastTickTs ? Math.min(0.05, (ts - engine.lastTickTs) / 1000) : 0.016;
  engine.lastTickTs = ts;
  engine.frameCount += 1;
  var t = ts / 1000;

  // 0. 封面悬停预掀动效（仅合书态生效）
  var hoverTarget = engine.bookState === "closed" && engine.hoveredObj && engine.hoveredObj.kind === "open-book" ? 1 : 0;
  if (Math.abs(hoverTarget - engine.coverHoverMix) > 0.002) {
    engine.coverHoverMix += (hoverTarget - engine.coverHoverMix) * Math.min(1, dt * 10);
    if (engine.bookState === "closed" && engine.frontCoverPivot) {
      engine.frontCoverPivot.rotation.z = engine.coverHoverMix * 0.075;
    }
  }

  // 1. 封面开合状态动画 & 相机在 Cover / Panoramic / Look Closer 间插值 + 窄屏自适应（零分配）
  if (engine.bookOpenAnim) {
    updateBookOpenAnimation(ts);
  }
  engine.targetCamMix = engine.bookState === "open" && engine.lookCloser ? 1 : 0;
  engine.camMix += (engine.targetCamMix - engine.camMix) * 0.1;
  engine.curNx += (engine.targetNx - engine.curNx) * 0.09;
  engine.curNy += (engine.targetNy - engine.curNy) * 0.09;

  var readPos = engine.tmpReadPos.lerpVectors(CAM_PRESETS.panoramic.pos, CAM_PRESETS.closer.pos, engine.camMix);
  var readLook = engine.tmpReadLook.lerpVectors(CAM_PRESETS.panoramic.look, CAM_PRESETS.closer.look, engine.camMix);
  var openEase = easeInOutCubic(engine.bookOpenFactor);
  var camPos = engine.tmpCamPos.lerpVectors(CAM_PRESETS.cover.pos, readPos, openEase);
  var camLook = engine.tmpCamLook.lerpVectors(CAM_PRESETS.cover.look, readLook, openEase);

  var aspect = engine.camera.aspect || 1.6;
  var aspectScale = aspect < 1.52 ? clamp(1.52 / Math.max(aspect, 0.92), 1, 1.24) : 1;
  if (aspectScale !== 1) {
    camPos.sub(camLook).multiplyScalar(aspectScale).add(camLook);
  }
  camPos.x += engine.curNx * 0.36;
  camPos.y -= engine.curNy * 0.14;
  engine.camera.position.copy(camPos);
  engine.camera.lookAt(camLook);

  // 2. 翻页 / 入场弹起动画 & 点击地板波纹
  if (engine.isFlipping) {
    updateFlipAnimation(ts);
  } else if (engine.popAnim && engine.bookState === "open") {
    var pp = clamp((ts - engine.popAnim.startTs) / engine.popAnim.duration, 0, 1);
    setCurrentDioramaPopUpProgress(pp, engine.popAnim.skipWalls);
    if (pp >= 1) {
      engine.popAnim = null;
    }
  }
  if (engine.walkRingAnim && engine.walkRingMesh) {
    var wp = clamp((ts - engine.walkRingAnim.startTs) / engine.walkRingAnim.duration, 0, 1);
    engine.walkRingMesh.scale.setScalar(0.5 + wp * 2.2);
    engine.walkRingMesh.material.opacity = 0.85 * (1 - wp);
    if (wp >= 1) {
      engine.walkRingMesh.visible = false;
      engine.walkRingAnim = null;
    }
  }

  // 3. 角色 Idle / 漫步 / 点击奔跑 / 特技 / 悬停反馈
  updateStandees(t, ts, dt);

  // 4. 各页专属 3D 动画
  updatePageProps(t, ts, dt);

  // 5. 桌面宝物呼吸与解锁发光旋转
  updateSouvenirs(t);

  // 6. 粒子池
  updateParticlePools(dt);

  if (engine.dustPoints) {
    engine.dustPoints.rotation.y = Math.sin(t * 0.08) * 0.06;
  }

  // 7. 阴影：翻页 / 开合 / 弹起期间每帧刷新，静态 idle 期间隔帧刷新
  var shadowMap = engine.renderer.shadowMap;
  shadowMap.needsUpdate = engine.isFlipping || Boolean(engine.popAnim) || Boolean(engine.bookOpenAnim) || engine.frameCount % 2 === 0;

  engine.renderer.render(engine.scene, engine.camera);
  engine.rafId = requestAnimationFrame(animateLoop);
}

function startLoop() {
  if (engine.rafId === null && engine.ready && !engine.pageHidden) {
    engine.lastTickTs = 0;
    engine.rafId = requestAnimationFrame(animateLoop);
  }
}

function handleVisibilityChange() {
  if (document.hidden) {
    engine.pageHidden = true;
    engine.hiddenSinceTs = performance.now();
    if (engine.rafId !== null) {
      cancelAnimationFrame(engine.rafId);
      engine.rafId = null;
    }
  } else if (engine.pageHidden) {
    var pausedMs = performance.now() - engine.hiddenSinceTs;
    engine.pageHidden = false;
    if (engine.bookOpenAnim) {
      engine.bookOpenAnim.startTs += pausedMs;
    }
    if (engine.walkRingAnim) {
      engine.walkRingAnim.startTs += pausedMs;
    }
    if (engine.flipAnim) {
      engine.flipAnim.startTs += pausedMs;
    }
    if (engine.popAnim) {
      engine.popAnim.startTs += pausedMs;
    }
    if (engine.p2Parcel && engine.p2Parcel.flightAnim) {
      engine.p2Parcel.flightAnim.startTs += pausedMs;
    }
    startLoop();
  }
}

function setKikiSpriteState(st, isCheer) {
  if (!st || !st.config || st.config.role !== "kiki") {
    return;
  }
  var targetFile = isCheer ? "kiki-cheer.webp" : "kiki-idle.webp";
  var token = engine.buildToken;
  getOrLoadDieCut(targetFile).then(function (dc) {
    if (token !== engine.buildToken) {
      return;
    }
    st.mat.map = dc.texture;
    st.mat.needsUpdate = true;
    st.depthMat.map = dc.texture;
    st.depthMat.needsUpdate = true;
    if (st.wWorld && st.hWorld) {
      st.baseMeshScaleX = (st.hWorld * dc.aspect) / st.wWorld;
      var dirSign = st.facing >= 0 ? 1 : -1;
      st.facingScale = dirSign;
      st.mesh.scale.x = st.baseMeshScaleX * dirSign;
    }
    placeKikiCrown(st, dc, isCheer);
  }).catch(function () {
    return null;
  });
}

/* ======================== Pointer / Raycaster 交互 ======================== */

function updateViewportSize() {
  if (!engine.ready || !engine.renderer || !engine.camera) {
    return;
  }
  var w = Math.max(320, window.innerWidth || 1280);
  var h = Math.max(240, window.innerHeight || 800);
  if (w === engine.lastWidth && h === engine.lastHeight) {
    return;
  }
  engine.lastWidth = w;
  engine.lastHeight = h;
  engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  engine.renderer.setSize(w, h, false);
  engine.camera.aspect = w / h;
  engine.camera.updateProjectionMatrix();
}

function isWorldVisible(obj) {
  var o = obj;
  while (o) {
    if (o.visible === false) {
      return false;
    }
    o = o.parent;
  }
  return true;
}

function pickInteractiveAt(clientX, clientY) {
  if (!engine.canvas || !engine.camera || engine.isFlipping || engine.bookState === "opening" || engine.bookState === "closing") {
    return null;
  }
  var rect = engine.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }
  engine.pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  engine.raycaster.setFromCamera(engine.pointerNdc, engine.camera);

  if (engine.bookState === "closed") {
    if (engine.frontCoverHitMesh) {
      var coverHits = engine.raycaster.intersectObjects([engine.frontCoverHitMesh], false);
      if (coverHits.length > 0 && coverHits[0].object && coverHits[0].object.userData.interact) {
        return { hit: coverHits[0], info: coverHits[0].object.userData.interact, obj: coverHits[0].object };
      }
    }
    return null;
  }

  var targets = [];
  for (var i = 0; i < engine.interactables.length; i += 1) {
    var m = engine.interactables[i].mesh;
    if (m && isWorldVisible(m)) {
      targets.push(m);
    }
  }

  var hits = engine.raycaster.intersectObjects(targets, false);
  if (hits.length > 0 && hits[0].object && hits[0].object.userData.interact) {
    return { hit: hits[0], info: hits[0].object.userData.interact, obj: hits[0].object };
  }

  var floorTargets = [];
  if (engine.leftFloorMesh && engine.leftFloorMesh.visible) {
    floorTargets.push(engine.leftFloorMesh);
  }
  if (engine.rightFloorMesh && engine.rightFloorMesh.visible) {
    floorTargets.push(engine.rightFloorMesh);
  }
  if (floorTargets.length > 0) {
    var floorHits = engine.raycaster.intersectObjects(floorTargets, false);
    if (floorHits.length > 0 && floorHits[0].object && floorHits[0].object.userData.interact) {
      return { hit: floorHits[0], info: floorHits[0].object.userData.interact, obj: floorHits[0].object };
    }
  }
  return null;
}

function runHoverPick() {
  engine.pickTimer = null;
  var pp = engine.pendingPointer;
  if (!pp || !engine.ready) {
    return;
  }
  engine.lastPickTs = performance.now();
  var picked = pickInteractiveAt(pp.x, pp.y);
  engine.hoveredObj = picked ? picked.info : null;
  engine.canvas.style.cursor = picked ? "pointer" : "default";
}

function handleCanvasPointerMove(ev) {
  if (!engine.ready || !engine.canvas) {
    return;
  }
  var rect = engine.canvas.getBoundingClientRect();
  if (rect.width && rect.height) {
    engine.targetNx = clamp(((ev.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
    engine.targetNy = clamp(((ev.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
  }
  engine.pendingPointer = { x: ev.clientX, y: ev.clientY };
  if (engine.isFlipping || engine.bookState === "opening" || engine.bookState === "closing") {
    return;
  }
  // 拾取节流：≤ 每 32ms 一次射线检测，并保留尾随一次确保停手位置准确
  var elapsed = performance.now() - engine.lastPickTs;
  if (elapsed >= POINTER_PICK_INTERVAL_MS) {
    if (engine.pickTimer) {
      clearTimeout(engine.pickTimer);
      engine.pickTimer = null;
    }
    runHoverPick();
  } else if (!engine.pickTimer) {
    engine.pickTimer = setTimeout(runHoverPick, POINTER_PICK_INTERVAL_MS - elapsed);
  }
}

function handleCanvasPointerLeave() {
  engine.targetNx = 0;
  engine.targetNy = 0;
  engine.hoveredObj = null;
  engine.pendingPointer = null;
  if (engine.pickTimer) {
    clearTimeout(engine.pickTimer);
    engine.pickTimer = null;
  }
  if (engine.canvas) {
    engine.canvas.style.cursor = "default";
  }
}

function pickBestWalker(preferRole) {
  if (engine.activeActorId && engine.standees[engine.activeActorId] && engine.standees[engine.activeActorId].movable) {
    return engine.standees[engine.activeActorId];
  }
  if (preferRole) {
    for (var i = 0; i < engine.standeeList.length; i += 1) {
      if (engine.standeeList[i].movable && engine.standeeList[i].config.role === preferRole) {
        return engine.standeeList[i];
      }
    }
  }
  for (var j = 0; j < engine.standeeList.length; j += 1) {
    if (engine.standeeList[j].movable) {
      return engine.standeeList[j];
    }
  }
  return null;
}

function findNearestMovable(tx, tz, preferRole, excludeSt) {
  var best = null;
  var bestD2 = Infinity;
  for (var pass = 0; pass < 2; pass += 1) {
    for (var i = 0; i < engine.standeeList.length; i += 1) {
      var st = engine.standeeList[i];
      if (!st.movable || st === excludeSt) {
        continue;
      }
      if (pass === 0 && preferRole && st.config.role !== preferRole) {
        continue;
      }
      var d2 = (st.curX - tx) * (st.curX - tx) + (st.curZ - tz) * (st.curZ - tz);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = st;
      }
    }
    if (best) {
      break;
    }
  }
  return best;
}

function handleCanvasClick(ev) {
  if (!engine.ready || engine.isFlipping || engine.bookState === "opening" || engine.bookState === "closing") {
    return;
  }
  var picked = pickInteractiveAt(ev.clientX, ev.clientY);
  if (!picked) {
    return;
  }
  var info = picked.info;

  if (info.kind === "open-book") {
    startOpenBookTransition();
    return;
  }

  var pWorld = picked.hit.point.clone();
  engine.dioramaGroup.worldToLocal(pWorld);

  if (info.kind === "walk-floor") {
    var targetPt = clampWalkTarget(pWorld.x, pWorld.z);
    triggerWalkRing(targetPt.x, targetPt.z);
    spawnParticleBurst3D(targetPt.x, pageSurfaceY(targetPt.x) + 0.08, targetPt.z, 8, "firework");
    var leadSt = pickBestWalker("kiki");
    if (leadSt) {
      commandActorMove(leadSt, targetPt.x, targetPt.z, true);
      var buddy = findNearestMovable(targetPt.x, targetPt.z, null, leadSt);
      if (buddy) {
        var bx = targetPt.x + (buddy.curX >= targetPt.x ? 0.65 : -0.65);
        commandActorMove(buddy, bx, targetPt.z + 0.18, true);
      }
      if (typeof engine.callbacks.onFloorWalk === "function") {
        engine.callbacks.onFloorWalk(engine.currentPage, leadSt.config.id, targetPt.x, targetPt.z);
      }
    }
    return;
  }

  if (info.kind === "turn-page") {
    if (typeof engine.callbacks.onRequestTurnPage === "function") {
      engine.callbacks.onRequestTurnPage(info.delta);
    }
    return;
  }

  if (info.kind === "p1-flower") {
    var nowFl = performance.now();
    for (var fli = 0; fli < engine.p1Flowers.length; fli += 1) {
      var flItem = engine.p1Flowers[fli];
      if ("p1-flower-" + fli === info.id) {
        flItem.bounceUntil = nowFl + 720;
        engine.p1ButterflyFocus = { x: flItem.x, y: pageSurfaceY(flItem.x), z: flItem.z, until: nowFl + 3800 };
        spawnParticleBurst3D(flItem.x, pageSurfaceY(flItem.x) + 0.35, flItem.z, 14, "confetti");
        var k1Fl = engine.standees["p1-kiki"];
        if (k1Fl) {
          commandActorMove(k1Fl, flItem.x + (k1Fl.curX >= flItem.x ? 0.44 : -0.44), clamp(flItem.z - 0.16, -0.8, 1.25), true);
          k1Fl.actionBurst = { kind: "jump", startTs: nowFl, duration: 520 };
        }
        break;
      }
    }
    if (typeof engine.callbacks.onInteractItem === "function") {
      engine.callbacks.onInteractItem(1, "p1-flower", info.id);
    }
    return;
  }

  if (info.kind === "start-adventure") {
    if (engine.p1EnteringGate) {
      return;
    }
    var nowGate = performance.now();
    engine.p1EnteringGate = true;
    spawnParticleBurst3D(pWorld.x, pWorld.y, pWorld.z, 24, "confetti");
    var k1Gate = engine.standees["p1-kiki"];
    if (k1Gate) {
      commandActorMove(k1Gate, 0.48, -1.12, true);
      k1Gate.actionBurst = { kind: "jump", startTs: nowGate, duration: 480 };
    }
    setTimeout(function () {
      engine.p1EnteringGate = null;
      if (engine.currentPage === 1 && typeof engine.callbacks.onInteractItem === "function") {
        engine.callbacks.onInteractItem(1, "start-adventure", info.id);
      }
    }, 360);
    return;
  }

  if (info.kind === "actor") {
    var st = engine.standees[info.id];
    if (st) {
      engine.activeActorId = st.config.id;
      var now = performance.now();
      if (st.config.action === "paw-chase-dash") {
        st.isWalking = false;
        st.orbitBurst = { kind: "chase-dash", originX: st.curX, originZ: st.curZ, startTs: now, duration: 1050 };
        st.actionBurst = null;
      } else if (st.config.action === "paw-skye-soar") {
        st.isWalking = false;
        st.orbitBurst = { kind: "skye-soar", originX: st.curX, originZ: st.curZ, startTs: now, duration: 1550 };
        st.actionBurst = null;
      } else if (st.config.action === "paw-marshall-flip") {
        st.isWalking = false;
        st.orbitBurst = { kind: "marshall-flip", originX: st.curX, originZ: st.curZ, startTs: now, duration: 850 };
        st.actionBurst = null;
      } else {
        st.actionBurst = { kind: "jump", startTs: now, duration: 600 };
      }
      if (info.pageNum === 4 && engine.p4Badges.length > 0) {
        var collected4 = 0;
        for (var b4i = 0; b4i < engine.p4Badges.length; b4i += 1) {
          var b4 = engine.p4Badges[b4i];
          if (b4.actorId === info.id && b4.mode === "hover") {
            b4.mode = "flying";
            b4.faceMat.emissiveIntensity = 0.55;
            b4.halo.material.opacity = 0.85;
            b4.flight = { startTs: now, duration: 920, sx: b4.curX, sy: b4.curY, sz: b4.curZ };
          }
          if (b4.mode === "flying" || b4.mode === "orbit") {
            collected4 += 1;
          }
        }
        var k4St = engine.standees["p4-kiki"];
        if (k4St && collected4 >= 3) {
          k4St.actionBurst = { kind: "jump", startTs: now + 350, duration: 650 };
          var pupIds4 = ["p4-chase", "p4-skye", "p4-marshall"];
          for (var p4k = 0; p4k < pupIds4.length; p4k += 1) {
            var pSt4 = engine.standees[pupIds4[p4k]];
            if (pSt4 && !pSt4.orbitBurst) {
              commandActorMove(pSt4, k4St.curX + 0.72 + p4k * 0.42, clamp(k4St.curZ + (p4k - 1) * 0.16, -0.5, 0.9), true);
            }
          }
        }
      }
      if (st.config.role === "kiki") {
        setKikiSpriteState(st, true);
        var stRef = st;
        setTimeout(function () {
          if (engine.standees[stRef.config.id] !== stRef) {
            return;
          }
          if (engine.currentPage !== 2 || !(engine.pageStateRef && engine.pageStateRef.p2 && engine.pageStateRef.p2.opened)) {
            setKikiSpriteState(stRef, false);
          }
        }, 1450);
      }
      spawnParticleBurst3D(st.curX, pageSurfaceY(st.curX) + st.hWorld * 0.7, st.curZ, 18, "confetti");
    }
    if (typeof engine.callbacks.onSelectActor === "function") {
      engine.callbacks.onSelectActor(info.pageNum, info.id);
    }
    return;
  }

  if (info.kind === "parcel") {
    var nowP2 = performance.now();
    if (engine.p2Delivery && engine.p2Delivery.active) {
      landP2DeliveryNow(nowP2);
    }
    if (engine.p2Parcel && !engine.p2Parcel.flightAnim) {
      launchP2Crown3D();
      engine.p2Parcel.celebrateUntil = nowP2 + 2600;
    }
    if (typeof engine.callbacks.onInteractItem === "function") {
      engine.callbacks.onInteractItem(2, "parcel", info.id);
    }
    return;
  }

  if (info.kind === "balloon") {
    var nowB3 = performance.now();
    for (var bi = 0; bi < engine.p3Balloons.length; bi += 1) {
      var bl = engine.p3Balloons[bi];
      if (bl.id === info.id) {
        bl.vy = 1.48;
        bl.vx += (Math.random() - 0.5) * 0.52;
        bl.vz += (Math.random() - 0.5) * 0.28;
        bl.squishUntil = nowB3 + 420;
        bl.bounceEnd = nowB3 + 420;
        bl.lastHitTs = nowB3;
        spawnParticleBurst3D(bl.curX, bl.curY, bl.curZ, 18, "confetti");
        var nearP3 = findNearestMovable(bl.curX, bl.curZ);
        if (nearP3) {
          commandActorMove(nearP3, bl.curX, clamp(bl.curZ + 0.18, -0.82, 1.02), true);
          nearP3.walkSpeed = 1.8;
          nearP3.actionBurst = { kind: "jump", startTs: nowB3, duration: 480 };
        }
        break;
      }
    }
    if (typeof engine.callbacks.onInteractItem === "function") {
      engine.callbacks.onInteractItem(3, "balloon", info.id);
    }
    return;
  }

  if (info.kind === "brick") {
    for (var ri = 0; ri < engine.p5Bricks.length; ri += 1) {
      var br = engine.p5Bricks[ri];
      if (br.id === info.id && !br.placed && !br.flying) {
        br.placed = true;
        br.flying = { startTs: performance.now(), tx: 0.96, tz: -1.06 };
        var nearMinifig = findNearestMovable(br.baseX, br.baseZ, "minifig");
        if (nearMinifig) {
          commandActorMove(nearMinifig, br.baseX, br.baseZ - 0.35, true);
        }
        if (engine.p5Car) {
          engine.p5Car.boostUntil = Math.max(engine.p5Car.boostUntil, performance.now() + 1200);
        }
        break;
      }
    }
    if (typeof engine.callbacks.onInteractItem === "function") {
      engine.callbacks.onInteractItem(5, "brick", info.id);
    }
    return;
  }

  if (info.kind === "lego-car") {
    var carObj = engine.p5Car;
    var clickNow = performance.now();
    if (carObj) {
      carObj.boostUntil = clickNow + 1900;
      carObj.hopStartTs = clickNow;
      spawnParticleBurst3D(carObj.curX, pageSurfaceY(carObj.curX) + 0.36, carObj.curZ, 18, "confetti");
      spawnParticleBurst3D(carObj.curX, pageSurfaceY(carObj.curX) + 0.3, carObj.curZ, 10, "firework");
      var nearCarBuddy = findNearestMovable(carObj.curX, carObj.curZ, "minifig");
      if (nearCarBuddy) {
        nearCarBuddy.actionBurst = { kind: "jump", startTs: clickNow, duration: 540 };
      }
    }
    if (typeof engine.callbacks.onInteractItem === "function") {
      engine.callbacks.onInteractItem(5, "lego-car", info.id);
    }
    return;
  }

  if (info.kind === "lights") {
    var nowL = performance.now();
    if (!engine.p6Lights || !engine.p6Lights.on) {
      engine.p6LightWave = { active: true, startTs: nowL, duration: 920, litIdx: -1 };
    } else {
      spawnParticleBurst3D(0, 2.3, -1.6, 24, "firework");
    }
    if (typeof engine.callbacks.onInteractItem === "function") {
      engine.callbacks.onInteractItem(6, "lights", info.id);
    }
    return;
  }

  if (info.kind === "p7-treat") {
    var nowTr = performance.now();
    for (var ti7 = 0; ti7 < engine.p7Treats.length; ti7 += 1) {
      var trItem = engine.p7Treats[ti7];
      if (trItem.id === info.id) {
        trItem.bounceUntil = nowTr + 480;
        spawnParticleBurst3D(trItem.x, pageSurfaceY(trItem.x) + 0.22, trItem.z, 12, "confetti");
        var k7Tr = engine.standees["p7-kiki"];
        if (k7Tr && trItem.z < 0.9) {
          k7Tr.actionBurst = { kind: "jump", startTs: nowTr, duration: 480 };
        }
        break;
      }
    }
    if (typeof engine.callbacks.onInteractItem === "function") {
      engine.callbacks.onInteractItem(7, "p7-treat", info.id);
    }
    return;
  }

  if (info.kind === "candle") {
    for (var ci = 0; ci < engine.p7Candles.length; ci += 1) {
      var cd = engine.p7Candles[ci];
      if (cd.id === info.id && cd.lit) {
        setCandleLit(cd, false);
        spawnParticleBurst3D(cd.worldPos.x, cd.worldPos.y, cd.worldPos.z, 12, "smoke");
      }
    }
    var remainLit = refreshCandleLight();
    if (engine.p7Cloud && remainLit === 0) {
      engine.p7Cloud.group.visible = false;
    }
    if (typeof engine.callbacks.onInteractItem === "function") {
      engine.callbacks.onInteractItem(7, "candle", info.id);
    }
    return;
  }

  if (info.kind === "blow-all") {
    var nowBlow = performance.now();
    if (!(engine.p7BlowAnim && engine.p7BlowAnim.active)) {
      engine.p7BlowAnim = { active: true, startTs: nowBlow, duration: 1150 };
      if (engine.p7Cloud) {
        engine.p7Cloud.puffUntil = nowBlow + 1150;
      }
      var k7Blow = engine.standees["p7-kiki"];
      if (k7Blow) {
        commandActorMove(k7Blow, -0.78, 0.16, true);
      }
    }
    if (typeof engine.callbacks.onInteractItem === "function") {
      engine.callbacks.onInteractItem(7, "blow-all", info.id);
    }
    return;
  }

  if (info.kind === "fireworks") {
    spawnParticleBurst3D(pWorld.x, clamp(pWorld.y, 1.5, 2.9), -1.6, 32, "firework");
    spawnParticleBurst3D(pWorld.x, clamp(pWorld.y, 1.5, 2.9), -1.6, 10, "confetti");
    if (typeof engine.callbacks.onInteractItem === "function") {
      engine.callbacks.onInteractItem(8, "fireworks", info.id);
    }
  }
}

/* ======================== 页面状态同步 ======================== */

function syncPageSlice(pageNum, slice) {
  if (!engine.pageStateRef) {
    engine.pageStateRef = {};
  }
  engine.pageStateRef["p" + pageNum] = slice;
  if (!slice) {
    return;
  }

  if (pageNum === 2) {
    var k2 = engine.standees["p2-kiki"];
    var pc = engine.p2Parcel;
    if (pc && slice.opened && !pc.opened) {
      launchP2Crown3D();
    } else if (pc && !slice.opened && pc.opened) {
      pc.opened = false;
      pc.targetLidAngle = 0;
      setP2GlowOpened(false);
      if (k2 && k2.crownMesh) {
        k2.crownMesh.visible = false;
        setKikiSpriteState(k2, false);
      }
    } else if (k2 && k2.crownMesh && !(pc && pc.flightAnim)) {
      k2.crownMesh.visible = Boolean(slice.opened);
    }
  } else if (pageNum === 5) {
    var flagSt = engine.standees["p5-flag-5"];
    if (flagSt) {
      var wasFlagHidden = !flagSt.root.visible;
      flagSt.root.visible = Boolean(slice.won);
      if (slice.won && wasFlagHidden) {
        var nowF5 = performance.now();
        flagSt.actionBurst = { kind: "flag-rise", startTs: nowF5, duration: 860 };
        for (var c5i = 0; c5i < engine.standeeList.length; c5i += 1) {
          var st5 = engine.standeeList[c5i];
          if (st5.movable) {
            st5.actionBurst = { kind: "jump", startTs: nowF5 + c5i * 45, duration: 600 };
          }
        }
      }
    }
    var placed = slice.placed || {};
    for (var i = 0; i < engine.p5Bricks.length; i += 1) {
      var br = engine.p5Bricks[i];
      var isPlaced = Boolean(placed[br.id]);
      if (isPlaced && !br.placed && !br.flying) {
        br.placed = true;
        br.flying = { startTs: performance.now(), tx: 0.96, tz: -1.06 };
      } else if (!isPlaced && br.placed) {
        br.placed = false;
        br.flying = null;
        br.group.position.set(0, 0, 0);
        br.root.visible = true;
      }
    }
  } else if (pageNum === 6 && engine.p6Lights) {
    if (engine.p6LightWave && engine.p6LightWave.active) {
      return;
    }
    var on = Boolean(slice.lightsOn);
    if (on !== engine.p6Lights.on) {
      setP6Lights(on);
    }
  } else if (pageNum === 7 && engine.p7Candles.length > 0) {
    if (engine.p7BlowAnim && engine.p7BlowAnim.active) {
      return;
    }
    var blown = slice.blown || {};
    for (var c = 0; c < engine.p7Candles.length; c += 1) {
      var cd = engine.p7Candles[c];
      var shouldLit = !blown[cd.id];
      if (cd.lit !== shouldLit) {
        setCandleLit(cd, shouldLit);
      }
    }
    var remain = refreshCandleLight();
    if (engine.p7Cloud) {
      engine.p7Cloud.group.visible = remain > 0;
    }
  }
}

/* ======================== 对外 API (`window.KikiPopup3D`) ======================== */

var KikiPopup3D = {
  init: function (canvasEl, storyData, callbacks, options) {
    if (!canvasEl || !storyData) {
      engine.failed = true;
      document.documentElement.setAttribute("data-popup3d", "fallback");
      return false;
    }
    if (engine.ready) {
      return true;
    }
    engine.canvas = canvasEl;
    engine.storyData = storyData;
    engine.callbacks = callbacks || {};
    var startClosed = !(options && options.startClosed === false);

    try {
      var renderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        antialias: true,
        powerPreference: "high-performance"
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      engine.renderer = renderer;

      var scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf3dec4);
      scene.fog = new THREE.Fog(0xf3dec4, 11, 23);

      var camera = new THREE.PerspectiveCamera(35, (window.innerWidth || 1280) / (window.innerHeight || 800), 0.1, 60);
      var initPreset = startClosed ? CAM_PRESETS.cover : CAM_PRESETS.panoramic;
      camera.position.copy(initPreset.pos);
      camera.lookAt(initPreset.look);

      // 共享资源（命中热区不渲染：material.visible=false 仍可被 Raycaster 拾取）
      engine.hitMat = new THREE.MeshBasicMaterial({ visible: false });
      engine.hitMat.userData.shared = true;
      engine.contactTex = makeContactShadowTexture();
      engine.glowTex = makeStarGlowTexture();

      // 照明：1024 剪影软阴影，正交阴影相机紧贴书本范围
      var amb = new THREE.AmbientLight(0xffe9d2, 1.0);
      var hemi = new THREE.HemisphereLight(0xfff6e5, 0x9c6234, 0.82);
      var keyLight = new THREE.DirectionalLight(0xfff3de, 1.45);
      keyLight.position.set(-4.8, 9.2, 5.8);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
      keyLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
      keyLight.shadow.camera.near = 3;
      keyLight.shadow.camera.far = 22;
      keyLight.shadow.camera.left = -6.4;
      keyLight.shadow.camera.right = 6.4;
      keyLight.shadow.camera.top = 5.2;
      keyLight.shadow.camera.bottom = -5.2;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
      keyLight.shadow.radius = 3;

      var rim = new THREE.DirectionalLight(0xdbeafe, 0.36);
      rim.position.set(6.5, 4.2, 4.5);

      engine.ambLight = amb;
      engine.hemiLight = hemi;
      engine.keyLight = keyLight;
      engine.rimLight = rim;
      scene.add(amb, hemi, keyLight, rim);

      buildNurseryDeskAndShelf(scene);
      buildHardcoverBookBase(scene);

      engine.scene = scene;
      engine.camera = camera;
      engine.ready = true;
      engine.failed = false;
      engine.pageHidden = Boolean(document.hidden);
      engine.bookState = startClosed ? "closed" : "open";
      applyTheme(!startClosed && engine.currentPage === 8);
      applyBookOpenFactor(startClosed ? 0 : 1);

      updateViewportSize();
      window.addEventListener("resize", updateViewportSize);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      canvasEl.addEventListener("pointermove", handleCanvasPointerMove, { passive: true });
      canvasEl.addEventListener("pointerleave", handleCanvasPointerLeave);
      canvasEl.addEventListener("click", handleCanvasClick);

      document.documentElement.setAttribute("data-popup3d", "webgl");
      startLoop();
      return true;
    } catch (err) {
      console.warn("KikiPopup3D init failed, fallback to DOM 2D:", err);
      engine.failed = true;
      engine.ready = false;
      document.documentElement.setAttribute("data-popup3d", "fallback");
      return false;
    }
  },

  isReady: function () {
    return engine.ready;
  },

  isBookOpen: function () {
    return engine.bookState === "open" || engine.bookState === "opening";
  },

  openBook: function (onComplete) {
    startOpenBookTransition(onComplete);
  },

  closeBook: function (onComplete) {
    startCloseBookTransition(onComplete);
  },

  moveActorTo: function (actorId, x, z) {
    if (!engine.ready) {
      return false;
    }
    var st = engine.standees[actorId];
    if (!st || !st.movable) {
      return false;
    }
    commandActorMove(st, Number(x) || 0, Number(z) || 0, true);
    return true;
  },

  setPage: function (pageNum, pageState) {
    if (!engine.ready || engine.isFlipping) {
      return Promise.resolve();
    }
    // 同页重复调用（渲染刷新）只同步状态，不重建舞台，避免弹起动画被打断与重复构建
    if (engine.hasBuilt && engine.currentPage === pageNum) {
      engine.pageStateRef = pageState || engine.pageStateRef;
      if (pageState) {
        syncPageSlice(pageNum, pageState["p" + pageNum]);
      }
      return Promise.resolve();
    }
    return buildPageContents(pageNum, pageState, false);
  },

  flipToPage: function (fromPage, toPage, dir, pageState, callbacks) {
    var cb = callbacks || {};
    if (!engine.ready || fromPage === toPage) {
      if (cb.onMidpoint) {
        cb.onMidpoint();
      }
      if (cb.onComplete) {
        cb.onComplete();
      }
      return Promise.resolve();
    }
    if (engine.bookState === "closed" || engine.bookState === "closing") {
      engine.bookState = "open";
      engine.bookOpenAnim = null;
      applyBookOpenFactor(1);
    }
    engine.walkRingAnim = null;
    if (engine.walkRingMesh) {
      engine.walkRingMesh.visible = false;
    }
    for (var si = 0; si < engine.standeeList.length; si += 1) {
      engine.standeeList[si].isWalking = false;
      engine.standeeList[si].orbitBurst = null;
    }
    engine.isFlipping = true;
    engine.popAnim = null;
    engine.hoveredObj = null;
    updateCornerVisibility();
    var direction = dir === "prev" ? "prev" : "next";

    // 翻页纸片：出发页右半 + 到达页左半（按方向）
    Promise.all([getOrLoadSpread(fromPage), getOrLoadSpread(toPage)]).then(function (arr) {
      var spFrom = arr[0];
      var spTo = arr[1];
      if (!engine.isFlipping) {
        return;
      }
      if (direction === "next") {
        engine.turnMat.map = spFrom.rightFloorTex;
        engine.turnBackMat.map = spTo.leftFloorTex;
      } else {
        engine.turnMat.map = spTo.rightFloorTex;
        engine.turnBackMat.map = spFrom.leftFloorTex;
      }
      engine.turnMat.needsUpdate = true;
      engine.turnBackMat.needsUpdate = true;
    }).catch(function () {
      return null;
    });

    engine.flipAnim = {
      fromPage: fromPage,
      toPage: toPage,
      dir: direction,
      pageState: pageState,
      startTs: performance.now(),
      duration: FLIP_DURATION_MS,
      midpointFired: false,
      popStarted: false,
      onMidpoint: cb.onMidpoint,
      onComplete: cb.onComplete
    };
    startLoop();
    return Promise.resolve();
  },

  syncPageState: function (pageNum, pageStateSlice) {
    if (!engine.ready || engine.currentPage !== pageNum) {
      return;
    }
    syncPageSlice(pageNum, pageStateSlice);
  },

  setUnlockedTreasures: function (unlockedMap) {
    engine.unlockedMap = Object.assign({}, unlockedMap || {});
  },

  toggleLookCloser: function (explicitBool) {
    engine.lookCloser = typeof explicitBool === "boolean" ? explicitBool : !engine.lookCloser;
    return engine.lookCloser;
  },

  triggerFireworks3D: function () {
    if (!engine.ready) {
      return;
    }
    spawnParticleBurst3D(-1.85, 2.35, -1.6, 34, "firework");
    spawnParticleBurst3D(1.85, 2.42, -1.6, 34, "firework");
    spawnParticleBurst3D(0, 2.2, -1.4, 24, "confetti");
  },

  getDebugInfo: function () {
    var rect = engine.canvas ? engine.canvas.getBoundingClientRect() : { left: 0, top: 0, width: 1280, height: 800 };
    var projList = [];
    if (engine.camera && engine.ready) {
      engine.camera.updateMatrixWorld();
      var worldPos = new THREE.Vector3();
      if (engine.bookState === "closed" && engine.frontCoverHitMesh) {
        engine.frontCoverHitMesh.getWorldPosition(worldPos);
        var coverNdc = worldPos.clone().project(engine.camera);
        projList.push({
          id: "book-front-cover",
          kind: "open-book",
          label: "翻开 KIKI 的5岁生日立体书",
          screenX: Number((rect.left + ((coverNdc.x + 1) * 0.5) * rect.width).toFixed(1)),
          screenY: Number((rect.top + ((-coverNdc.y + 1) * 0.5) * rect.height).toFixed(1)),
          worldY: Number(worldPos.y.toFixed(2))
        });
      } else {
        for (var i = 0; i < engine.interactables.length; i += 1) {
          var item = engine.interactables[i];
          if (!item.mesh || !isWorldVisible(item.mesh)) {
            continue;
          }
          item.mesh.getWorldPosition(worldPos);
          var ndc = worldPos.clone().project(engine.camera);
          projList.push({
            id: item.id,
            kind: item.kind,
            label: item.label,
            screenX: Number((rect.left + ((ndc.x + 1) * 0.5) * rect.width).toFixed(1)),
            screenY: Number((rect.top + ((-ndc.y + 1) * 0.5) * rect.height).toFixed(1)),
            worldY: Number(worldPos.y.toFixed(2))
          });
        }
      }
    }
    var actorInfos = [];
    for (var ai = 0; ai < engine.standeeList.length; ai += 1) {
      var st = engine.standeeList[ai];
      actorInfos.push({
        id: st.config.id,
        role: st.config.role,
        x: Number(st.curX.toFixed(3)),
        z: Number(st.curZ.toFixed(3)),
        isWalking: Boolean(st.isWalking),
        isAir: Boolean(st.isAir)
      });
    }
    var activeParticles = 0;
    if (engine.pools) {
      activeParticles = engine.pools.confetti.active + engine.pools.spark.active + engine.pools.smoke.active;
    }
    return {
      ready: engine.ready,
      failed: engine.failed,
      bookState: engine.bookState,
      bookOpenFactor: Number(engine.bookOpenFactor.toFixed(3)),
      activeActorId: engine.activeActorId,
      cameraPos: engine.camera
        ? [
            Number(engine.camera.position.x.toFixed(2)),
            Number(engine.camera.position.y.toFixed(2)),
            Number(engine.camera.position.z.toFixed(2))
          ]
        : null,
      currentPage: engine.currentPage,
      isFlipping: engine.isFlipping,
      lookCloser: engine.lookCloser,
      isNight: engine.isNight,
      standeeCount: engine.standeeList.length,
      actors: actorInfos,
      foldableCount: engine.foldables.length,
      leftWallRotationX: engine.leftWallPivot ? Number(engine.leftWallPivot.rotation.x.toFixed(3)) : null,
      rightWallRotationX: engine.rightWallPivot ? Number(engine.rightWallPivot.rotation.x.toFixed(3)) : null,
      wallScaleY: engine.leftWallPivot ? Number(engine.leftWallPivot.scale.y.toFixed(3)) : null,
      wallVisible: engine.leftWallPivot ? engine.leftWallPivot.visible : null,
      turnVisible: engine.turnPivot ? engine.turnPivot.visible : null,
      dioramaVisible: engine.dioramaGroup ? engine.dioramaGroup.visible : null,
      unlockedCount: Object.keys(engine.unlockedMap).filter(function (k) {
        return engine.unlockedMap[k];
      }).length,
      pixelRatio: engine.renderer ? engine.renderer.getPixelRatio() : null,
      shadowMapSize: SHADOW_MAP_SIZE,
      cachedSpreads: Object.keys(engine.spreadCache).map(Number),
      activeParticles: activeParticles,
      paused: engine.pageHidden,
      drawCalls: engine.renderer ? engine.renderer.info.render.calls : null,
      interactables: projList
    };
  }
};

window.KikiPopup3D = KikiPopup3D;
window.dispatchEvent(new CustomEvent("kiki-popup3d-ready", { detail: KikiPopup3D }));
