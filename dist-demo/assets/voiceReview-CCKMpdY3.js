import{V as d,a as E}from"./voice-script-BjZ8HaEl.js";const ce="zhe-yi-shen:voice-review:v2",le="zhe-yi-shen:voice-review:auto-next",de="zhe-yi-shen:voice-review:volume",ue=["童年","少年","青年","成年","中年","暮年"],ye={clear:"近声",phone:"电话",pa:"广播","behind-door":"门后",memory:"回忆",swallowed:"咽下",exhaled:"吐出"},he={calm:"克制",happy:"愉快",sad:"低落",fearful:"不安",surprised:"意外",angry:"愤怒",disgusted:"厌恶"},be={"clear-throat":"清嗓",breath:"换气",inhale:"吸气",exhale:"呼气",pause:"定长停顿"},Y={pending:"未审核",approved:"通过",revise:"需重做",hold:"待定"},we={page:{name:"纸页翻动",purpose:"开始、过场与界面确认"},breath:{name:"短促呼吸",purpose:"自动攻击，不使用枪响"},hit:{name:"闷钝命中",purpose:"普通敌人受击"},hurt:{name:"身体受伤",purpose:"主角承受伤害"},coin:{name:"零钱落袋",purpose:"拾取零钱与奖励"},wear:{name:"穿戴物证",purpose:"道具进入这一身"},swallow:{name:"咽下",purpose:"命运选择向内收回"},exhale:{name:"吐出",purpose:"命运选择向外说出"},boss:{name:"低频压迫",purpose:"首领登场与危险预告"},deny:{name:"拒绝反馈",purpose:"余额不足或操作无效"},"childhood-room":{name:"童年 · 雨夜房间",purpose:"雨、房间低频与远处滴落"},classroom:{name:"少年 · 教室",purpose:"日光灯、纸笔与安静人声空间"},station:{name:"青年 · 末班站台",purpose:"风道、轨道低鸣与提示音"},apartment:{name:"成年 · 租住房",purpose:"冰箱、钟表与没有坐齐的饭桌"},office:{name:"中年 · 办公室",purpose:"空调、日光灯与零星键盘声"},hospital:{name:"暮年 · 病房走廊",purpose:"设备低鸣与远处监护提示"}},u=document.querySelector("#voice-review");if(!u)throw new Error("missing voice review root");const i=new Audio;i.preload="metadata";const k=new Map(d.map(e=>[e,"checking"])),I=new Map,F=new Map,O=Se();let w=null,M=null,c=d[0],J=new URLSearchParams(window.location.search).get("view")==="sounds"?"sounds":"voices",q=null;function $e(e,n){var o;try{const t=Number.parseFloat((o=localStorage.getItem(e))!=null?o:"");return Number.isFinite(t)?t:n}catch{return n}}function Se(){var e;try{const n=JSON.parse((e=localStorage.getItem(ce))!=null?e:"{}");return new Map(d.flatMap(o=>{const t=n[o];return t&&["pending","approved","revise","hold"].includes(t.decision)?[[o,t]]:[]}))}catch{return new Map}}function v(e){var n;return(n=O.get(e))!=null?n:{decision:"pending",note:"",updatedAt:""}}function pe(e){var n,o;return(o=(n=I.get(e))==null?void 0:n.assetRevision)!=null?o:0}function xe(){var n;let e=!1;for(const o of d){const t=O.get(o);if(!t||t.decision==="pending")continue;const s=pe(o),a=(n=t.reviewedRevision)!=null?n:0;s<=a||(O.set(o,{...t,decision:"pending",previousDecision:t.decision,updatedAt:new Date().toISOString()}),e=!0)}e&&K()}function K(){try{localStorage.setItem(ce,JSON.stringify(Object.fromEntries(O)))}catch{}}function Q(e){return e.replace(/<#[\d.]+#>/g," ").replace(/\([a-z-]+\)/g,"").replace(/\s+/g,"").trim()}function _(e){return e.stage==="ending"?"结局":ue[e.stage]}function ve(e){var n,o;return new URL((o=(n=I.get(e.id))==null?void 0:n.reviewFile)!=null?o:e.file,document.baseURI).href}function B(e){if(!Number.isFinite(e)||e<0)return"0:00";const n=Math.floor(e/60),o=Math.floor(e%60);return`${n}:${String(o).padStart(2,"0")}`}u.innerHTML=`
  <div class="voice-shell">
    <header class="voice-head">
      <div>
        <p class="voice-kicker">VOICE PRODUCTION REVIEW · 逐条审听</p>
        <h1>《这一身》配音审核台</h1>
        <p class="voice-summary">从第 1 条开始依次试听，判断音色、语气、停顿、发音和场景是否成立。审核结果与备注自动保存在这台电脑上。</p>
      </div>
      <div class="voice-counts" aria-label="配音审核统计">
        <span><strong data-count="all">${d.length}</strong><br>总条目</span>
        <span><strong data-count="reviewed">0</strong><br>已审核</span>
        <span><strong data-count="approved">0</strong><br>已通过</span>
        <span><strong data-count="revise">0</strong><br>需处理</span>
      </div>
    </header>

    <nav class="review-tabs" aria-label="审听类别">
      <button type="button" data-view="voices">固定语音 <span>${d.length}</span></button>
      <button type="button" data-view="sounds">音效与环境 <span data-sound-count>16</span></button>
    </nav>

    <section data-panel="voices">
      <div class="voice-toolbar" aria-label="语音筛选">
        <input type="search" data-filter="search" aria-label="搜索台词、人物或场景" placeholder="搜索台词、人物或场景" />
        <select data-filter="stage" aria-label="按人生阶段筛选">
          <option value="">全部阶段</option>
          ${[...ue,"结局"].map(e=>`<option>${e}</option>`).join("")}
        </select>
        <select data-filter="asset" aria-label="按资产状态筛选">
          <option value="">全部资产</option>
          <option value="ready">可试听</option>
          <option value="missing">待生成</option>
        </select>
        <select data-filter="review" aria-label="按审核结论筛选">
          <option value="">全部结论</option>
          <option value="pending">只看未审核</option>
          <option value="approved">已通过</option>
          <option value="revise">需重做</option>
          <option value="hold">待定</option>
        </select>
        <label class="volume-control">音量
          <input data-volume type="range" min="0" max="1" value="${$e(de,.82)}" step="0.01" />
        </label>
      </div>

      <section class="review-overview" aria-label="审核进度">
        <div>
          <strong data-progress-copy>0 / ${d.length} 已审核</strong>
          <span>快捷键：空格播放 · A 通过 · R 重做 · H 待定 · ← → 切换</span>
        </div>
        <div class="review-progress-track"><span data-review-progress></span></div>
        <div class="review-overview-actions">
          <label><input type="checkbox" data-auto-next /> 标记后自动播放下一条</label>
          <button type="button" data-unreviewed>从未审核继续</button>
          <button type="button" data-export>导出审核记录</button>
        </div>
      </section>

      <section class="review-stage" data-review-stage aria-live="polite"></section>

      <div class="queue-head">
        <div>
          <p class="voice-kicker">REVIEW QUEUE</p>
          <h2>审核队列</h2>
        </div>
        <span data-filter-count>${d.length} 条</span>
      </div>
      <section class="voice-list" aria-live="polite"></section>
    </section>

    <section class="sound-panel" data-panel="sounds">
      <div class="sound-list" aria-live="polite"></div>
    </section>
  </div>
`;const D=u.querySelector('[data-filter="search"]'),G=u.querySelector('[data-filter="stage"]'),X=u.querySelector('[data-filter="asset"]'),Z=u.querySelector('[data-filter="review"]'),U=u.querySelector("[data-volume]"),V=u.querySelector("[data-auto-next]"),z=u.querySelector(".voice-list"),H=u.querySelector(".sound-list"),g=u.querySelector("[data-review-stage]");V.checked=(()=>{try{return localStorage.getItem(le)!=="false"}catch{return!0}})();function A(){const e=D.value.trim().toLowerCase(),n=G.value,o=X.value,t=Z.value;return d.filter(s=>{var p;const a=E[s],r=v(s),l=F.get(s),m=[s,a.text,a.context.scene,a.context.speaker,a.trigger.condition,a.purpose,a.delivery.voice,a.delivery.tone,a.delivery.emotion,(p=l==null?void 0:l.transcript)!=null?p:"",r.note,...a.delivery.tags].join(" ").toLowerCase();return(!e||m.includes(e))&&(!n||_(a)===n)&&(!o||k.get(s)===o)&&(!t||r.decision===t)})}function P(){const e=d.map(v),n=e.filter(a=>a.decision!=="pending").length,o=e.filter(a=>a.decision==="approved").length,t=e.filter(a=>a.decision==="revise").length,s=e.filter(a=>a.decision==="hold").length;u.querySelector('[data-count="reviewed"]').textContent=String(n),u.querySelector('[data-count="approved"]').textContent=String(o),u.querySelector('[data-count="revise"]').textContent=String(t+s),u.querySelector("[data-progress-copy]").textContent=`${n} / ${d.length} 已审核 · ${t} 条需重做 · ${s} 条待定`,u.querySelector("[data-review-progress]").style.width=`${n/d.length*100}%`}function ee(e){J=e;for(const n of u.querySelectorAll("[data-panel]"))n.hidden=n.dataset.panel!==e;for(const n of u.querySelectorAll("[data-view]"))n.dataset.active=String(n.dataset.view===e);e==="sounds"&&(i.pause(),h())}function W(e,n={}){c=e,ee("voices"),C(),y(),n.scroll&&g.scrollIntoView({behavior:"smooth",block:"start"}),n.autoplay&&k.get(e)==="ready"&&te(e)}function T(e,n=!1){const o=A();if(!o.length)return;const t=o.indexOf(c),s=t<0?0:Math.max(0,Math.min(o.length-1,t+e));W(o[s],{autoplay:n,scroll:!0})}function me(e=!1){i.pause(),i.loop=!1,i.currentTime=0,e&&(i.removeAttribute("src"),i.load(),w=null,M=null),h(),y(),N()}async function te(e){const n=E[e];(w!==e||M!==null)&&(i.pause(),i.loop=!1,i.src=ve(n),i.currentTime=0),i.volume=Number(U.value),w=e,M=null,c=e,C(),y();try{await i.play(),h()}catch{k.set(e,"missing"),w=null,C(),y(),P()}}async function ge(){if(k.get(c)==="ready"){if(w===c&&!i.paused){i.pause(),h(),y();return}await te(c)}}async function Ee(e,n,o){i.pause(),i.src=new URL(`assets/audio/${n.file}`,document.baseURI).href,i.currentTime=0,i.volume=Number(U.value),i.loop=o,w=null,M=e,N();try{await i.play(),N()}catch{me(!0)}}function j(e,n){var t;const o=v(e);if(O.set(e,{...o,decision:n,updatedAt:new Date().toISOString(),reviewedRevision:pe(e),previousDecision:void 0}),K(),P(),C(),y(),n!=="pending"&&V.checked){const s=A(),a=s.indexOf(e),r=(t=s.slice(a+1).find(l=>v(l).decision==="pending"))!=null?t:d.slice(d.indexOf(e)+1).find(l=>v(l).decision==="pending");r&&W(r,{autoplay:!0,scroll:!0})}}function ke(e,n){const o=v(e);O.set(e,{...o,note:n,updatedAt:new Date().toISOString()}),K()}function h(){var r,l,m,p;const e=g.querySelector("[data-toggle-play]"),n=g.querySelector("[data-seek]"),o=g.querySelector("[data-time]");if(!e||!n||!o)return;const t=w===c;e.textContent=t&&!i.paused?"暂停":t&&i.currentTime>0?"继续播放":"播放这一条";const s=Number.isFinite(i.duration)&&t?i.duration:((p=(m=(r=I.get(c))==null?void 0:r.reviewDurationMs)!=null?m:(l=I.get(c))==null?void 0:l.durationMs)!=null?p:0)/1e3,a=t?i.currentTime:0;n.max=String(Math.max(.01,s)),n.value=String(Math.min(a,s)),n.disabled=k.get(c)!=="ready",o.textContent=`${B(a)} / ${B(s)}`}function C(){var S,L,f,ne,oe,ae,se,ie;const e=E[c],n=v(c),o=F.get(c),t=I.get(c),s=(S=k.get(c))!=null?S:"checking",a=A(),r=a.indexOf(c),l=d.indexOf(c),m=[e.delivery.voice,`语调 · ${e.delivery.tone}`,`情绪 · ${he[e.delivery.emotion]}`,`语速 · ${e.delivery.speed.toFixed(2)}x`,`音高 · ${e.delivery.pitch>0?"+":""}${e.delivery.pitch}`,`强度 · ${e.delivery.intensity==="low"?"轻":"中"}`,...e.delivery.tags.map(x=>{var re;return`动作 · ${(re=be[x])!=null?re:x}`})],p=(o==null?void 0:o.status)==="pass"?"qa-pass":"qa-review",$=(o==null?void 0:o.status)==="pass"?"机器质检通过":o?"机器提示人工复核":"质检载入中",R=n.previousDecision?Y[n.previousDecision]:"";g.dataset.decision=n.decision,g.innerHTML=`
    <div class="review-stage-topline">
      <button type="button" data-previous ${r<=0?"disabled":""}>← 上一条</button>
      <span>筛选队列 ${r>=0?r+1:"—"} / ${a.length} · 全部 ${l+1} / ${d.length}</span>
      <button type="button" data-next ${r<0||r>=a.length-1?"disabled":""}>下一条 →</button>
    </div>
    <div class="review-stage-source">
      <div>
        <span class="stage-stamp">${_(e)}</span>
        <p>${e.context.scene} · ${e.context.speaker}</p>
        <small>${c}</small>
      </div>
      <span class="review-decision ${n.decision}">${Y[n.decision]}</span>
    </div>
    ${n.previousDecision?`
      <div class="revision-notice">
        <strong>第二版已更新</strong>
        <span>原结论：${R}。原备注已保留，请重新试听后确认。</span>
      </div>
    `:""}
    <blockquote>“${Q(e.text)}”</blockquote>
    <div class="audio-transport">
      <button type="button" class="transport-main" data-toggle-play ${s!=="ready"?"disabled":""}>播放这一条</button>
      <button type="button" data-replay ${s!=="ready"?"disabled":""}>从头重播</button>
      <input type="range" data-seek min="0" max="1" step="0.01" value="0" aria-label="播放进度" />
      <span data-time>0:00 / ${B(((f=(L=t==null?void 0:t.reviewDurationMs)!=null?L:t==null?void 0:t.durationMs)!=null?f:0)/1e3)}</span>
      <span class="asset-pill ${s}">${s==="ready"?`音频就绪${t!=null&&t.assetRevision?` · 第 ${t.assetRevision+1} 版`:""}`:s==="missing"?"音频缺失":"正在核对"}</span>
    </div>
    <div class="review-detail-grid">
      <section>
        <h3>表演合同</h3>
        <div class="voice-delivery">${m.map(x=>`<span>${x}</span>`).join("")}</div>
        <p>${e.performance}</p>
      </section>
      <section>
        <h3>剧情与触发</h3>
        <p>${e.trigger.required?"必然语音":"隐藏语音"} · P${e.trigger.priority} · ${ye[e.treatment]}</p>
        <p>${e.trigger.condition}</p>
        <p class="review-purpose">${e.purpose}</p>
      </section>
      <section class="qa-panel ${p}">
        <h3>${$}</h3>
        <p>${o?`ASR：${o.transcript}`:"正在读取反向转写结果。"}</p>
        <small>${o?`发音差异 ${Math.round(o.pronunciationErrorRate*100)}%${o.charactersPerSecond?` · ${o.charactersPerSecond.toFixed(2)} 字/秒`:""}`:""}</small>
      </section>
      <section>
        <h3>成品信息</h3>
        <p>${(ne=t==null?void 0:t.provider)!=null?ne:"—"} · ${(oe=t==null?void 0:t.model)!=null?oe:"—"}</p>
        <p>${(ae=t==null?void 0:t.voiceId)!=null?ae:"音色信息载入中"}</p>
        <small>${t!=null&&t.reviewDurationMs||t!=null&&t.durationMs?`${(((ie=(se=t.reviewDurationMs)!=null?se:t.durationMs)!=null?ie:0)/1e3).toFixed(2)} 秒${t.reviewFile?" · 已合成审听版":""}`:"—"}</small>
        ${t!=null&&t.postprocess?`<small>${t.postprocess}</small>`:""}
      </section>
    </div>
    <div class="review-form">
      <div class="decision-buttons" role="group" aria-label="审核结论">
        <button type="button" data-decision="approved" class="${n.decision==="approved"?"selected":""}">通过 <kbd>A</kbd></button>
        <button type="button" data-decision="revise" class="${n.decision==="revise"?"selected":""}">需重做 <kbd>R</kbd></button>
        <button type="button" data-decision="hold" class="${n.decision==="hold"?"selected":""}">待定 <kbd>H</kbd></button>
        ${n.decision!=="pending"?'<button type="button" data-decision="pending">撤回结论</button>':""}
      </div>
      <label>
        审核备注
        <textarea data-review-note rows="3" placeholder="例如：父亲声线对，但“你忙吧”句尾还要再收一点。"></textarea>
      </label>
    </div>
  `;const b=g.querySelector("[data-review-note]");b.value=n.note,b.addEventListener("input",()=>ke(c,b.value)),g.querySelector("[data-previous]").addEventListener("click",()=>T(-1)),g.querySelector("[data-next]").addEventListener("click",()=>T(1)),g.querySelector("[data-toggle-play]").addEventListener("click",()=>{ge()}),g.querySelector("[data-replay]").addEventListener("click",()=>{w===c&&(i.currentTime=0),te(c)}),g.querySelector("[data-seek]").addEventListener("input",x=>{w===c&&(i.currentTime=Number(x.target.value),h())});for(const x of g.querySelectorAll("[data-decision]"))x.addEventListener("click",()=>j(c,x.dataset.decision));h()}function y(){var n;const e=A();if(u.querySelector("[data-filter-count]").textContent=`${e.length} 条`,z.replaceChildren(),!e.length){const o=document.createElement("div");o.className="empty-state",o.textContent="没有符合当前筛选条件的语音。",z.append(o);return}for(const o of e){const t=E[o],s=v(o),a=F.get(o),r=document.createElement("button");r.type="button",r.className="voice-card",r.dataset.selected=String(o===c),r.dataset.decision=s.decision,r.dataset.status=(n=k.get(o))!=null?n:"checking";const l=document.createElement("span");l.className="queue-number",l.textContent=String(d.indexOf(o)+1).padStart(2,"0");const m=document.createElement("span");m.className="queue-copy";const p=document.createElement("strong");p.textContent=`${_(t)} · ${t.context.scene} · ${t.context.speaker}`;const $=document.createElement("span");$.textContent=`“${Q(t.text)}”`;const R=document.createElement("small");R.textContent=[a&&a.status!=="pass"?"ASR 待复核":"",s.note?`备注：${s.note}`:t.delivery.tone].filter(Boolean).join(" · "),m.append(p,$,R);const b=document.createElement("span");b.className=`review-decision ${s.decision}`,b.textContent=Y[s.decision];const S=document.createElement("span");S.className="queue-playing",S.textContent=w===o&&!i.paused?"正在播放":k.get(o)==="ready"?"可试听":"缺音频",r.append(l,m,S,b),r.addEventListener("click",()=>W(o,{scroll:!0})),z.append(r)}}function N(){var n;if(H.replaceChildren(),!q){const o=document.createElement("div");o.className="empty-state",o.textContent="正在核对声音资产。",H.append(o);return}const e=[{title:"操作与战斗音效",entries:Object.entries(q.sfx),loop:!1},{title:"六章环境循环",entries:Object.entries(q.ambience).map(([o,t])=>{var a,r;return[(r=(a=t.file.split("/").pop())==null?void 0:a.replace(/\.(wav|mp3)$/,""))!=null?r:o,t]}),loop:!0}];for(const o of e){const t=document.createElement("section");t.className="sound-group";const s=document.createElement("h2");s.textContent=o.title;const a=document.createElement("div");a.className="sound-grid";for(const[r,l]of o.entries){const m=(n=we[r])!=null?n:{name:r,purpose:l.file},p=document.createElement("article");p.className="sound-card";const $=document.createElement("div"),R=document.createElement("strong");R.textContent=m.name;const b=document.createElement("span");b.textContent=m.purpose;const S=document.createElement("small");if(S.textContent=`${l.seconds.toFixed(2)} 秒 · ${l.file}`,$.append(R,b,S),l.source){const f=document.createElement("a");f.href=l.source.landing,f.target="_blank",f.rel="noreferrer",f.textContent=`${l.source.creator} · ${l.source.license}`,f.title=l.source.title,$.append(f)}else{const f=document.createElement("small");f.textContent="项目自制设计音",$.append(f)}const L=document.createElement("button");L.type="button",L.className="play-button",L.textContent=M===r&&!i.paused?"停止":"试听",L.addEventListener("click",()=>{M===r&&!i.paused?me():Ee(r,l,o.loop)}),p.append($,L),a.append(p)}t.append(s,a),H.append(t)}}function fe(){const e=A();e.length&&!e.includes(c)&&(c=e[0]),C(),y()}function Le(){D.value="",G.value="",X.value="",Z.value="pending";const e=d.find(n=>v(n).decision==="pending");e?W(e,{scroll:!0}):fe()}function Re(){const e={project:"这一身",exportedAt:new Date().toISOString(),summary:{total:d.length,approved:d.filter(t=>v(t).decision==="approved").length,revise:d.filter(t=>v(t).decision==="revise").length,hold:d.filter(t=>v(t).decision==="hold").length,pending:d.filter(t=>v(t).decision==="pending").length},entries:d.map(t=>({id:t,stage:_(E[t]),scene:E[t].context.scene,speaker:E[t].context.speaker,text:Q(E[t].text),...v(t)}))},n=new Blob([`${JSON.stringify(e,null,2)}
`],{type:"application/json"}),o=document.createElement("a");o.href=URL.createObjectURL(n),o.download=`这一身-配音审核-${new Date().toISOString().slice(0,10)}.json`,o.click(),URL.revokeObjectURL(o.href)}async function qe(e){var t;const n=await fetch(ve(E[e]),{headers:{Range:"bytes=0-2"}}).catch(()=>null),o=(t=n==null?void 0:n.headers.get("content-type"))!=null?t:"";k.set(e,n!=null&&n.ok&&(o.includes("audio")||o.includes("mpeg"))?"ready":"missing")}for(const e of[D,G,X,Z])e.addEventListener(e===D?"input":"change",fe);U.addEventListener("input",()=>{i.volume=Number(U.value);try{localStorage.setItem(de,U.value)}catch{}});V.addEventListener("change",()=>{try{localStorage.setItem(le,String(V.checked))}catch{}});u.querySelector("[data-unreviewed]").addEventListener("click",Le);u.querySelector("[data-export]").addEventListener("click",Re);for(const e of u.querySelectorAll("[data-view]"))e.addEventListener("click",()=>ee(e.dataset.view));i.addEventListener("timeupdate",h);i.addEventListener("loadedmetadata",h);i.addEventListener("play",()=>{h(),y()});i.addEventListener("pause",()=>{h(),y(),N()});i.addEventListener("ended",()=>{i.loop||(i.currentTime=0,h(),y())});window.addEventListener("keydown",e=>{if(J!=="voices")return;const n=e.target;n!=null&&n.matches('input, textarea, select, [contenteditable="true"]')||(e.code==="Space"?(e.preventDefault(),ge()):e.key==="ArrowLeft"?(e.preventDefault(),T(-1)):e.key==="ArrowRight"?(e.preventDefault(),T(1)):e.key.toLowerCase()==="a"?j(c,"approved"):e.key.toLowerCase()==="r"?j(c,"revise"):e.key.toLowerCase()==="h"&&j(c,"hold"))});P();C();y();N();ee(J);(async()=>{const[e,n,o]=await Promise.all([fetch(new URL("assets/audio/sound-manifest.json",document.baseURI)),fetch(new URL("assets/audio/voice/manifest.json",document.baseURI)),fetch(new URL("assets/audio/voice/qa-report.json",document.baseURI)),Promise.all(d.map(qe))]);if(e.ok&&(q=await e.json()),n.ok){const s=await n.json();for(const a of s)I.set(a.id,a);xe()}if(o.ok){const s=await o.json();for(const a of s)F.set(a.id,a)}const t=q?Object.keys(q.sfx).length+Object.keys(q.ambience).length:0;u.querySelector("[data-sound-count]").textContent=String(t),P(),C(),y(),N(),document.documentElement.dataset.ready="true"})();
