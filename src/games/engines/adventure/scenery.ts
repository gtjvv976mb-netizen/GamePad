/** Deterministic world illustration: physical walls become keeps, bookshelves,
 * forest edges and rocky coastlines rather than a visible board of tiles. */
export function wall(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, id: number) {
  ctx.save();
  if (kind === "ibl") {
    ctx.fillStyle = "#142e2477"; ctx.beginPath(); ctx.ellipse(x + 8, y + 26, 55, 36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#5d4c32"; ctx.fillRect(x - 10, y - 21, 19, 63); ctx.fillStyle = "#977249"; ctx.fillRect(x - 4, y - 16, 5, 51);
    for (let i = 0; i < 8; i++) { const a = i * 2.399, px = x + Math.cos(a) * 27, py = y - 34 + Math.sin(a) * 24; ctx.fillStyle = ["#3c6040", "#4e7245", "#355440", "#608246"][(i + id) % 4]; ctx.beginPath(); ctx.ellipse(px, py, 33, 29, a, 0, Math.PI * 2); ctx.fill(); }
    for (let i = 0; i < 24; i++) { const px = x - 44 + (i * 43 + id * 7) % 88, py = y - 73 + (i * 29 + id * 3) % 72; ctx.fillStyle = i % 3 ? "#9baa6333" : "#b4c77955"; ctx.fillRect(px, py, 4, 3); }
  } else if (kind === "sws") {
    ctx.fillStyle = "#a6d5cb44"; ctx.beginPath(); ctx.ellipse(x, y + 9, 55, 45, -.2, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) { const px = x - 25 + i * 24, py = y + (i % 2 ? -13 : 12); ctx.fillStyle = "#294c5177"; ctx.beginPath(); ctx.ellipse(px + 8, py + 16, 34, 23, -.3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ["#8e9c85", "#6d877c", "#546f69"][(i + id) % 3]; ctx.beginPath(); ctx.moveTo(px - 31, py + 12); ctx.lineTo(px - 20, py - 25); ctx.lineTo(px + 4, py - 37); ctx.lineTo(px + 27, py - 16); ctx.lineTo(px + 36, py + 15); ctx.lineTo(px + 15, py + 30); ctx.lineTo(px - 20, py + 25); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#c0cbb02e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px - 16, py - 22); ctx.lineTo(px + 2, py - 30); ctx.lineTo(px + 20, py - 11); ctx.stroke(); }
  } else if (kind === "eov") {
    ctx.fillStyle = "#080f2066"; ctx.fillRect(x - 42, y - 34, 97, 93); ctx.fillStyle = "#4d3b32"; ctx.fillRect(x - 46, y - 46, 92, 92); ctx.fillStyle = "#8c7051"; ctx.fillRect(x - 46, y - 46, 92, 7); ctx.fillRect(x - 46, y + 38, 92, 8);
    for (let row = 0; row < 2; row++) { ctx.fillStyle = "#221f2b"; ctx.fillRect(x - 37, y - 32 + row * 40, 74, 28); for (let i = 0; i < 7; i++) { const height = 19 + (id * 13 + i * 7) % 8; ctx.fillStyle = ["#8a5355", "#626e87", "#8c8454", "#63775c", "#765785"][(i + id) % 5]; ctx.fillRect(x - 34 + i * 10, y - 5 + row * 40 - height, 8, height); ctx.fillStyle = "#dac89766"; ctx.fillRect(x - 33 + i * 10, y - 1 + row * 40 - height, 6, 2); } ctx.fillStyle = "#987a56"; ctx.fillRect(x - 41, y - 1 + row * 40, 82, 4); }
    ctx.fillStyle = "#aa8357"; ctx.fillRect(x - 44, y - 36, 6, 71); ctx.fillRect(x + 38, y - 36, 6, 71);
  } else {
    ctx.fillStyle = "#080f2066"; ctx.fillRect(x - 40, y - 34, 98, 93); ctx.fillStyle = "#3e4a55"; ctx.fillRect(x - 46, y - 46, 92, 92); ctx.fillStyle = "#64717a"; ctx.fillRect(x - 46, y - 46, 92, 7);
    for (let row = 0; row < 4; row++) { for (let i = 0; i < 3; i++) { const px = x - 45 + i * 31 + (row % 2 ? -14 : 0), py = y - 36 + row * 22; ctx.fillStyle = (row + i + id) % 3 ? "#424e58" : "#4a5761"; ctx.fillRect(Math.max(x - 45, px), py, Math.min(30, x + 45 - px), 20); ctx.strokeStyle = "#8e9aa22a"; ctx.beginPath(); ctx.moveTo(Math.max(x - 45, px) + 3, py + 2); ctx.lineTo(Math.min(x + 42, px + 27), py + 2); ctx.stroke(); } }
    if (id % 11 === 0) { ctx.fillStyle = "#68465a"; ctx.beginPath(); ctx.moveTo(x - 13, y - 22); ctx.lineTo(x + 13, y - 22); ctx.lineTo(x + 13, y + 29); ctx.lineTo(x, y + 20); ctx.lineTo(x - 13, y + 29); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#bba176"; ctx.fillRect(x - 2, y - 11, 4, 22); ctx.fillRect(x - 7, y - 4, 14, 3); }
  }
  ctx.restore();
}
export function ground(ctx: CanvasRenderingContext2D, kind: string, time: number) {
  ctx.save();
  for (let i = 0; i < 360; i++) {
    const x = 108 + (i * 137 + 47) % 1258, y = 109 + (i * 193 + 71) % 609;
    if (kind === "ibl") { ctx.strokeStyle = i % 3 ? "#96ad6a38" : "#24392b7a"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 6); ctx.moveTo(x, y); ctx.lineTo(x + 4, y - 8); ctx.stroke(); if (i % 11 === 0) { ctx.fillStyle = "#d5bb734c"; ctx.fillRect(x - 1, y - 7, 3, 3); } }
    else if (kind === "sws") { ctx.strokeStyle = "#88cfd334"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 12, y - 2 + Math.sin(time + i) * 3, x + 25, y); ctx.stroke(); }
    else { ctx.fillStyle = i % 4 ? "#75899410" : "#121b2540"; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 8, y - 2); ctx.lineTo(x + 10, y + 4); ctx.lineTo(x - 2, y + 5); ctx.closePath(); ctx.fill(); }
  }
  if (kind === "hcr") for (let i = 0; i < 15; i++) { const x = 160 + i * 81, y = 224 + (i * 71) % 400; ctx.fillStyle = "#393d4266"; ctx.fillRect(x, y, 19, 11); ctx.fillStyle = "#727b7e3a"; ctx.fillRect(x + 2, y + 1, 15, 2); }
  ctx.restore();
}

/** Floor illustration and distant architecture remain below physical actors. */
export function landmark(ctx: CanvasRenderingContext2D, kind: string, chapter: number, time: number, restored: boolean) {
  ctx.save();
  const x = 1020, y = 574;
  if (kind === "hcr") {
    ctx.strokeStyle = "#a495713c"; ctx.lineWidth = 3;
    if (chapter === 0) {
      // A bell mounted in the northern keep, with its light spilling below it.
      ctx.fillStyle = "#b3996433"; ctx.beginPath(); ctx.ellipse(830, 154, 110, 55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#95816d"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(787, 89); ctx.lineTo(787, 20); ctx.lineTo(873, 20); ctx.lineTo(873, 89); ctx.stroke();
      ctx.fillStyle = "#9a7c4f"; ctx.beginPath(); ctx.moveTo(813, 40); ctx.quadraticCurveTo(806, 74, 796, 86); ctx.lineTo(864, 86); ctx.quadraticCurveTo(854, 74, 847, 40); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#d1b578"; ctx.fillRect(813, 40, 34, 6); ctx.beginPath(); ctx.arc(830, 90, 6, 0, Math.PI * 2); ctx.fill();
    } else if (chapter === 1) {
      for (let i = 0; i < 18; i++) { const a = i * 2.399, px = x + Math.cos(a) * (30 + i * 7), py = y + Math.sin(a) * (30 + i * 4); ctx.strokeStyle = "#a68b5a32"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(px - 50, py + 25, px, py); ctx.stroke(); ctx.fillStyle = "#bb825746"; ctx.beginPath(); ctx.ellipse(px, py, 7, 3, a, 0, Math.PI * 2); ctx.fill(); }
    } else if (chapter === 2) {
      ctx.fillStyle = "#639aa52b"; ctx.beginPath(); ctx.ellipse(x - 20, y, 180, 85, -.2, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 4; i++) { ctx.strokeStyle = "#a9c9cf35"; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x - 20, y, 40 + i * 39, 20 + i * 17, -.2, time * .2 + i, time * .2 + i + 4.9); ctx.stroke(); }
      for (let i = 0; i < 5; i++) { ctx.strokeStyle = "#a4acbc28"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(702 + i * 78, 410); ctx.quadraticCurveTo(739 + i * 78, 350, 776 + i * 78, 410); ctx.stroke(); }
    } else if (chapter === 3) {
      for (let r = 1; r <= 3; r++) { ctx.strokeStyle = "#9bbacf37"; ctx.beginPath(); ctx.arc(x, y, r * 49, 0, Math.PI * 2); ctx.stroke(); }
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, px = x + Math.cos(a) * 147, py = y + Math.sin(a) * 147; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(px, py); ctx.stroke(); ctx.fillStyle = "#dac9a374"; ctx.fillRect(px - 3, py - 3, 6, 6); }
    } else if (chapter === 4) {
      ctx.strokeStyle = "#c6a66b35"; ctx.lineWidth = 5; ctx.strokeRect(x - 170, y - 105, 340, 210); ctx.strokeRect(x - 155, y - 90, 310, 180);
      for (let i = 0; i < 13; i++) { ctx.fillStyle = i % 2 ? "#d2b47a35" : "#9c86522b"; ctx.fillRect(x - 140 + i * 22, y + 62, 16, 8); }
    } else {
      ctx.fillStyle = "#b98e6040"; ctx.beginPath(); ctx.ellipse(x, y, 186, 110, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#d5be813c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, 170, 98, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#99794c"; ctx.fillRect(1100, 15, 80, 66); ctx.fillStyle = "#443346"; ctx.fillRect(1112, 24, 56, 54); ctx.fillStyle = "#c2a262"; ctx.fillRect(1094, 73, 92, 15); ctx.fillRect(1102, 87, 10, 16); ctx.fillRect(1167, 87, 10, 16);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = "#d5be8180"; const a = i / 6 * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 109, y + Math.sin(a) * 63, 7, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  if (kind === "eov") {
    ctx.strokeStyle = restored ? "#a7ddc75c" : "#b8a97638"; ctx.lineWidth = 2;
    if (chapter === 1) {
      for (let i = 0; i < 4; i++) { ctx.strokeStyle = restored ? "#86cdda70" : "#5d91a642"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(235, 397 + i * 31); ctx.bezierCurveTo(650, 280 + i * 58, 975, 675 - i * 62, 1295, 395 + i * 31); ctx.stroke(); }
    } else if (chapter === 2) {
      for (let i = 0; i < 25; i++) { const px = 700 + (i * 61) % 600, py = 420 + (i * 79) % 240; ctx.strokeStyle = "#8ca87b3c"; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 7, py - 23); ctx.stroke(); ctx.fillStyle = "#7c9d6566"; ctx.beginPath(); ctx.ellipse(px - 2, py - 16, 9, 4, -.8, 0, Math.PI * 2); ctx.fill(); }
    } else if (chapter === 3) {
      const stars = Array.from({ length: 13 }, (_, i) => ({ x: 790 + (i * 101) % 480, y: 390 + (i * 57) % 280 }));
      ctx.beginPath(); stars.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      stars.forEach((p, i) => { ctx.fillStyle = `rgba(227,213,164,${.35 + Math.sin(time * 2 + i) * .15})`; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); });
    } else if (chapter === 4) {
      ctx.beginPath(); ctx.ellipse(x, y, 153, 90, 0, 0, Math.PI * 2); ctx.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 155, y + Math.sin(a) * 91, 16, 0, Math.PI * 2); ctx.stroke(); }
    } else {
      ctx.lineWidth = 2; for (let i = 0; i < 3; i++) ctx.strokeRect(x - 190 + i * 12, y - 93 + i * 9, 380 - i * 24, 186 - i * 18);
      ctx.font = "18px monospace"; ctx.fillStyle = "#cbb98d31"; ctx.textAlign = "center"; ctx.fillText(chapter === 5 ? "EVERY STORY HAS A READER" : "REMEMBER THE READER", x, y + 7);
    }
  }
  ctx.restore();
}

/** Vael stations expose each chapter's different mechanism in the world. */
export function mechanism(ctx: CanvasRenderingContext2D, x: number, y: number, chapter: number, index: number, value: number, solved: boolean, time: number) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = "#111d2666"; ctx.beginPath(); ctx.ellipse(0, 23, 38, 16, 0, 0, Math.PI * 2); ctx.fill();
  if (chapter === 1) {
    ctx.strokeStyle = solved ? "#75c8d5" : "#789199"; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-39, 14); ctx.lineTo(39, 14); ctx.stroke();
    ctx.fillStyle = "#a88d57"; ctx.beginPath(); ctx.arc(0, -3, 27, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#ead3a0"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -3, 21, 0, Math.PI * 2); ctx.stroke(); ctx.save(); ctx.translate(0, -3); ctx.rotate(value * Math.PI / 2); ctx.beginPath(); ctx.moveTo(-19, 0); ctx.lineTo(19, 0); ctx.moveTo(0, -19); ctx.lineTo(0, 19); ctx.stroke(); ctx.fillStyle = "#496a70"; ctx.fillRect(-4, -23, 8, 9); ctx.restore();
  } else if (chapter === 2) {
    ctx.save(); ctx.rotate(value * Math.PI / 2); ctx.fillStyle = "#92724d"; ctx.fillRect(-29, -37, 58, 62); ctx.fillStyle = "#3f3c44"; ctx.fillRect(-22, -29, 44, 44); for (let i = 0; i < 5; i++) { ctx.fillStyle = ["#87a17a", "#b7a66b", "#8e666e"][i % 3]; ctx.fillRect(-19 + i * 8, -24, 6, 34); } ctx.fillStyle = "#bb9b68"; ctx.fillRect(-31, 9, 62, 6); ctx.restore();
  } else if (chapter === 5) {
    ctx.fillStyle = solved || value === 1 ? "#d5c78c" : "#647e84"; ctx.fillRect(-9, -31, 18, 56); ctx.beginPath(); ctx.arc(0, -30, 22, 0, Math.PI * 2); ctx.fill(); if (value === 1) { const light = ctx.createRadialGradient(0, -30, 4, 0, -30, 65); light.addColorStop(0, "#f8eaaa55"); light.addColorStop(1, "#f8eaaa00"); ctx.fillStyle = light; ctx.fillRect(-65, -95, 130, 130); }
  } else {
    ctx.strokeStyle = solved ? "#c4e4c1" : "#b4a77d"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 30, 27, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "#1d313a"; ctx.beginPath(); ctx.ellipse(0, 0, 25, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = solved ? "#e9d9a0" : "#b4c5b299"; ctx.font = "25px serif"; ctx.textAlign = "center"; ctx.fillText(["☼", "≈", "♧", "☽"][index], 0, 9 + Math.sin(time * 2) * 2);
  }
  ctx.font = "12px monospace"; ctx.fillStyle = "#e8d5a4"; ctx.textAlign = "center"; ctx.fillText(chapter === 1 ? `VALVE ${index + 1} · ${value}` : chapter === 2 ? `SHELF ${index + 1} · ${value}` : chapter === 5 ? `LIGHT ${index + 1} · ${value}` : ["SUN", "WAVE", "ROOT", "MOON"][index], 0, 45);
  ctx.restore();
}
