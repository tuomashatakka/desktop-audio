const fs=require("fs");const p="/Users/mia/Documents/Projects/desktop-audio/src/app/styles/player.css";let c=fs.readFileSync(p,"utf8");const ls=c.split("
");const f=ls.slice(0,22).concat(ls.slice(51)).join("
");let d=f;d=d.replace("background: var(--bg);

  & .empty-player","background: var(--bg);
  container-type: size;

  & .empty-player");d=d.replace("  width: 340px;
  height: 340px;","  width: clamp(80px, 40cqh, 320px);
  aspect-ratio: 1;");d=d.replace("flex-shrink: 0;","flex-shrink: 1;");const x=d.indexOf("/* ─── Track info");const q="
@container (max-width: 300px) {
  .player-view { flex-direction: row; align-items: center; }
  .album-art-card { width: clamp(40px, 20cqw, 100px); }
}
";d=d.slice(0,x)+q+d.slice(x);fs.writeFileSync(p,d);console.log("Updated\!");
