/* Se ejecuta recién cuando gate.js descifró la tabla y dejó window.ACS listo. */
window.startApp=function(){
"use strict";

var TERMS=ACS.TERMS, AC0=ACS.AC0, AC100=ACS.AC100, SACS=ACS.SACS, MATRIX=ACS.MATRIX;
var COM_TERMS=ACS.COM_TERMS, LEVELS=ACS.LEVELS;
var PRIMA_MIN=ACS.PRIMA_MIN, PRIMA_MAX=ACS.PRIMA_MAX;

/* ── Interpolación monótona (pchip) ─────────────────────────────────── */
function endSlope(h0,h1,d0,d1){var m=((2*h0+h1)*d0-h0*d1)/(h0+h1);
  if(m*d0<=0)m=0; else if(d0*d1<=0&&Math.abs(m)>Math.abs(3*d0))m=3*d0; return m;}
function pchip(xs,ys){var n=xs.length,h=[],d=[],i;
  for(i=0;i<n-1;i++){h[i]=xs[i+1]-xs[i];d[i]=(ys[i+1]-ys[i])/h[i];}
  var m=new Array(n);
  m[0]=endSlope(h[0],h[1],d[0],d[1]);
  m[n-1]=endSlope(h[n-2],h[n-3],d[n-2],d[n-3]);
  for(i=1;i<n-1;i++){ if(d[i-1]*d[i]<=0){m[i]=0;} else {
    var w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1]; m[i]=(w1+w2)/(w1/d[i-1]+w2/d[i]); } }
  return function(x){var k=n-2,j;
    for(j=0;j<n-1;j++){if(x<=xs[j+1]){k=j;break;}}
    if(x<xs[0])k=0;
    var t=(x-xs[k])/h[k],t2=t*t,t3=t2*t;
    return (2*t3-3*t2+1)*ys[k]+(t3-2*t2+t)*h[k]*m[k]+(-2*t3+3*t2)*ys[k+1]+(t3-t2)*h[k]*m[k+1];};}

/* ── Admin charge según término y sacrificio ────────────────────────────
   Regla del sistema (eApp, endpoint de comisión), validada punto a punto:
     Total(T,s) = Min(T) + (Max(T) - Min(T)) * (1 - s)
     Anual(T,s) = Total(T,s) / (dias(T) / 365)
   Max y Min se interpolan LINEAL POR DIAS entre las anclas de ACS.ADMIN
   ({terms:[3,4,5,8,10], max:[...], min:[...]}, en % del total del plazo).
   Los dias de cada termino son dias calendario desde hoy, como el sistema.
   Sin ACS.ADMIN en la tabla se cae a la curva vieja (pchip sobre AC0/AC100). */
var ac0, ac100, ADMIN=ACS.ADMIN;
if(ADMIN){
  var D0=new Date(); D0=new Date(D0.getFullYear(),D0.getMonth(),D0.getDate());
  var daysOf=function(T){var y=Math.floor(T+1e-9),
    d=new Date(D0.getFullYear()+y,D0.getMonth(),D0.getDate());
    return Math.round((d-D0)/864e5)+(T-y)*365;};
  var AD=ADMIN.terms.map(daysOf);
  var lin=function(ys,x){var n=AD.length,k;
    if(x<=AD[0])return ys[0]; if(x>=AD[n-1])return ys[n-1];
    for(k=0;k<n-1;k++){if(x<=AD[k+1])break;}
    return ys[k]+(ys[k+1]-ys[k])*(x-AD[k])/(AD[k+1]-AD[k]);};
  ac0=function(T){var d=daysOf(T);return lin(ADMIN.max,d)/(d/365);};
  ac100=function(T){var d=daysOf(T);return lin(ADMIN.min,d)/(d/365);};
}else{
  var order=[10,9,8,7,6,5,4,3];
  var xs=order.map(function(t){return 1/t;});
  var f0=pchip(xs,order.map(function(t){return AC0[t];}));
  var f100=pchip(xs,order.map(function(t){return AC100[t];}));
  ac0=function(T){return f0(1/T);}; ac100=function(T){return f100(1/T);};
}
function acOf(T,s){var a=ac0(T);return a+(ac100(T)-a)*s/100;}
function sacFromAc(T,v){var a=ac0(T),b=ac100(T);return (a-v)/(a-b)*100;}

/* ── Comisión: escala fija de la estructura ─────────────────────────
   Cada nivel trae su ACS publicado a 3, 5, 8 y 10 años; entre esos
   términos se interpola. Comisión = ACS × Prima × (1 − Sacrificio%). */
var LVL={}, COM={};
LEVELS.forEach(function(L){ LVL[L.n]=L; COM[L.n]=pchip(COM_TERMS,L.acs); });
function comPctOf(T,nivel){var f=COM[nivel];return f?f(T):null;}
function comMaxOf(prima,T,nivel){var q=comPctOf(T,nivel);
  return q===null?null:prima*q/100;}

/* ── Estado y formato ───────────────────────────────────────────────── */
var st={prima:100000,T:10,nivel:ACS.DEFAULT_LEVEL,s:0,mode:"y",ymd:{y:10,m:0,d:0},days:0},primaOk=true;
var $=function(id){return document.getElementById(id);};
var fmtM=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
var fmtM2=new Intl.NumberFormat("en-US",{maximumFractionDigits:0});
function pct(v,d){return v.toFixed(d==null?2:d);}
function pctLvl(v){return pct(v,v%1?1:0);}
/* El sacrificio admite 2 decimales: se muestran solo si el valor los tiene. */
function sacN(v){return Math.round(v*100)/100;}
function sacTxt(v){var r=sacN(v);return r%1?r.toFixed(2):String(r);}

/* ── Término: años enteros o término específico (años, meses, días) ────
   Como en la eApp: el término específico se cuenta en días calendario
   desde hoy y tiene que quedar entre 3 y 10 años. st.T se guarda en años
   de forma que daysOf(st.T) dé exactamente esos días. */
var TD=new Date(); TD=new Date(TD.getFullYear(),TD.getMonth(),TD.getDate());
function calDays(y,m,d){return Math.round((new Date(TD.getFullYear()+y,TD.getMonth()+m,TD.getDate()+d)-TD)/864e5);}
var DMIN=calDays(3,0,0), DMAX=calDays(10,0,0);
function nf(v){return new Intl.NumberFormat("en-US").format(v);}
function plural(n,w){return n+" "+w+(n===1?"":"s");}
function termTxt(){
  if(st.mode==="y") return plural(st.T,"year");
  var p=[plural(st.ymd.y,"year")];
  if(st.ymd.m) p.push(plural(st.ymd.m,"month"));
  if(st.ymd.d) p.push(plural(st.ymd.d,"day"));
  return p.join(" ");
}
function termErr(err){var msg=$("termErr");
  msg.textContent=err; msg.classList.toggle("on",!!err);
  ["tsY","tsM","tsD"].forEach(function(id){$(id).classList.toggle("bad",!!err);});}
function setYears(y){termErr("");st.mode="y";st.T=y;st.ymd={y:y,m:0,d:0};render();}
function setSpec(y,m,d){
  var err="";
  if(![y,m,d].every(function(v){return isFinite(v)&&v>=0&&Math.floor(v)===v;}))
    err="Enter whole numbers of years, months and days.";
  else if(m>11) err="Months must be between 0 and 11.";
  else if(d>30) err="Days must be between 0 and 30.";
  else { var days=calDays(y,m,d);
    if(days<DMIN) err="The term must be at least 3 years.";
    else if(days>DMAX) err="The term cannot exceed 10 years.";
    else { st.mode="s"; st.ymd={y:y,m:m,d:d}; st.T=y+(days-calDays(y,0,0))/365; st.days=days; } }
  termErr(err);
  if(!err) render();
}

var selN=$("nivel");
LEVELS.forEach(function(L){var o=document.createElement("option");
  o.value=L.n;o.textContent="Level "+L.n+" · "+pctLvl(L.pct)+"%";selN.appendChild(o);});
selN.value=st.nivel;

/* ── Tablas ─────────────────────────────────────────────────────────── */
function buildLevels(){
  var h="<thead><tr><th class='lft'>Level</th><th>%</th>";
  COM_TERMS.forEach(function(T){h+="<th>ACS "+T+"Y</th>";});
  h+="</tr></thead><tbody>";
  LEVELS.forEach(function(L){
    h+="<tr data-n='"+L.n+"'><th class='lft'>Level "+L.n+"</th><td>"+pctLvl(L.pct)+"</td>";
    L.acs.forEach(function(v){h+="<td>"+pct(v)+"%</td>";});
    h+="</tr>";});
  $("lvls").innerHTML=h+"</tbody>";
}

function buildMatrix(){
  var h="<thead><tr><th class='lft'>Sacrifice</th>";
  TERMS.forEach(function(T){h+="<th data-t='"+T+"'>"+T+" yrs</th>";});
  h+="</tr></thead><tbody>";
  SACS.forEach(function(s){h+="<tr data-s='"+s+"'><th>"+s+"%</th>";
    MATRIX[s].forEach(function(v,i){h+="<td data-s='"+s+"' data-t='"+TERMS[i]+"'>"+pct(v)+"%</td>";});
    h+="</tr>";});
  $("mtx").innerHTML=h+"</tbody>";
}

/* ── Gráfico ────────────────────────────────────────────────────────── */
var W=960,H=380,PL=58,PR=100,PT=36,PB=46;
var X0=3,X1=10,Y0=0,Y1=2.5;
function px(T){return PL+(T-X0)/(X1-X0)*(W-PL-PR);}
function py(v){return H-PB-(v-Y0)/(Y1-Y0)*(H-PT-PB);}
function path(fn){var d="",T;
  for(var k=0;k<=140;k++){T=X0+(X1-X0)*k/140;d+=(k?"L":"M")+px(T).toFixed(2)+" "+py(fn(T)).toFixed(2);}
  return d;}

function drawChart(){
  var s=st.s,T=st.T,v=acOf(T,s),g="";
  g+="<g>";
  for(var y=0;y<=2.5001;y+=0.5){
    g+="<line x1='"+PL+"' y1='"+py(y).toFixed(1)+"' x2='"+(W-PR)+"' y2='"+py(y).toFixed(1)+"' stroke='var(--line)' stroke-width='1'/>";
    g+="<text class='ax' x='"+(PL-10)+"' y='"+(py(y)+3.5).toFixed(1)+"' text-anchor='end'>"+pct(y,1)+"%</text>";}
  TERMS.forEach(function(t){
    g+="<text class='ax' x='"+px(t).toFixed(1)+"' y='"+(H-PB+18)+"' text-anchor='middle'>"+t+"</text>";});
  g+="<text class='axname' x='"+(W-PR)+"' y='"+(H-6)+"' text-anchor='end'>Term (years)</text>";
  g+="<text class='axname' x='"+(PL-46)+"' y='16'>Admin charge (% p.a.)</text>";
  g+="</g>";
  var env=path(function(t){return ac0(t);}),k2;
  for(k2=140;k2>=0;k2--){var tt2=X0+(X1-X0)*k2/140;env+="L"+px(tt2).toFixed(2)+" "+py(ac100(tt2)).toFixed(2);}
  g+="<path d='"+env+"Z' fill='var(--teal)' fill-opacity='.05' stroke='none'/>";
  SACS.forEach(function(q){ if(Math.abs(q-s)<0.5) return;
    g+="<path d='"+path(function(t){return acOf(t,q);})+"' fill='none' stroke='var(--teal)' stroke-opacity='.2' stroke-width='1'/>";});
  g+="<text class='dirlab' x='"+(W-PR+8)+"' y='"+(py(ac0(10))+3.5).toFixed(1)+"'>s = 0%</text>";
  g+="<text class='dirlab' x='"+(W-PR+8)+"' y='"+(py(ac100(10))+3.5).toFixed(1)+"'>s = 100%</text>";
  g+="<path d='"+path(function(t){return acOf(t,s);})+"' fill='none' stroke='var(--teal)' stroke-width='2.5' stroke-linecap='round'/>";
  g+="<line id='cross' x1='0' y1='"+PT+"' x2='0' y2='"+(H-PB)+"' stroke='var(--line-strong)' stroke-width='1' stroke-dasharray='3 3' opacity='0'/>";
  g+="<circle cx='"+px(T).toFixed(2)+"' cy='"+py(v).toFixed(2)+"' r='7' fill='var(--teal)' stroke='var(--surface)' stroke-width='2.5'/>";
  var lx=px(T), anchor=lx>W-PR-70?"end":"start", ox=anchor==="end"?-13:13;
  g+="<text class='dirlab' style='font-weight:600' x='"+(lx+ox).toFixed(1)+"' y='"+(py(v)-12).toFixed(1)+"' text-anchor='"+anchor+"' fill='var(--teal)'>"+pct(v)+"%</text>";
  g+="<rect id='hit' x='"+PL+"' y='"+PT+"' width='"+(W-PL-PR)+"' height='"+(H-PT-PB)+"' fill='transparent' style='cursor:crosshair'/>";
  $("chart").innerHTML=g;
  wireChart();
}

function wireChart(){
  var svg=$("chart"),hit=document.getElementById("hit"),cross=document.getElementById("cross"),tt=$("tt");
  if(!hit)return;
  function tAt(ev){var r=svg.getBoundingClientRect(),sx=(ev.clientX-r.left)/r.width*W;
    return Math.min(X1,Math.max(X0,X0+(sx-PL)/(W-PL-PR)*(X1-X0)));}
  hit.addEventListener("mousemove",function(ev){
    var T=tAt(ev),v=acOf(T,st.s),cx=comMaxOf(st.prima,T,st.nivel),cm=cx===null?null:cx*(1-st.s/100);
    cross.setAttribute("x1",px(T));cross.setAttribute("x2",px(T));cross.setAttribute("opacity","1");
    tt.innerHTML="<b>"+pct(v)+"%</b> admin charge<br>"+pct(T,2)+" years · sacrifice "+sacTxt(st.s)+"%"+((primaOk&&cm!==null)?"<br>commission "+fmtM.format(cm):"");
    var r=svg.getBoundingClientRect(),wr=$("chartWrap").getBoundingClientRect();
    var lx=r.left-wr.left+px(T)/W*r.width, ly=r.top-wr.top+py(v)/H*r.height;
    tt.style.opacity="1";
    tt.style.left=Math.min(Math.max(6,lx-tt.offsetWidth/2),wr.width-tt.offsetWidth-6)+"px";
    tt.style.top=(ly-tt.offsetHeight-16)+"px";});
  hit.addEventListener("mouseleave",function(){cross.setAttribute("opacity","0");tt.style.opacity="0";});
  hit.addEventListener("click",function(ev){setT(Math.round(tAt(ev)*4)/4);});
}

function highlight(){
  var nt=TERMS.reduce(function(a,b){return Math.abs(b-st.T)<Math.abs(a-st.T)?b:a;});
  var ns=Math.round(st.s/10)*10;
  Array.prototype.forEach.call(document.querySelectorAll("#mtx td"),function(c){c.classList.remove("hot");});
  Array.prototype.forEach.call(document.querySelectorAll("#mtx tr, #lvls tr"),function(r){r.classList.remove("rowhot");});
  Array.prototype.forEach.call(document.querySelectorAll("#mtx th[data-t]"),function(c){c.classList.remove("colhot");});
  var row=document.querySelector("#mtx tr[data-s='"+ns+"']");if(row)row.classList.add("rowhot");
  var cell=document.querySelector("#mtx td[data-s='"+ns+"'][data-t='"+nt+"']");if(cell)cell.classList.add("hot");
  var head=document.querySelector("#mtx th[data-t='"+nt+"']");if(head)head.classList.add("colhot");
  var lrow=document.querySelector("#lvls tr[data-n='"+st.nivel+"']");if(lrow)lrow.classList.add("rowhot");
}

/* ── Validación y render ────────────────────────────────────────────── */
var lock=false;
function checkPrima(){
  var el=$("prima"),msg=$("primaErr"),v=st.prima;
  primaOk = !(isFinite(v)===false) && v>=PRIMA_MIN && v<=PRIMA_MAX;
  if(primaOk){ el.classList.remove("bad"); msg.classList.remove("on"); msg.textContent=""; }
  else{
    el.classList.add("bad"); msg.classList.add("on");
    msg.textContent = (v<PRIMA_MIN)
      ? "Premium below the minimum. The accepted range is "+fmtM.format(PRIMA_MIN)+" to "+fmtM.format(PRIMA_MAX)+"."
      : "Premium above the maximum. The accepted range is "+fmtM.format(PRIMA_MIN)+" to "+fmtM.format(PRIMA_MAX)+".";
  }
  return primaOk;
}

function render(){
  lock=true;
  var T=st.T,s=st.s;
  var a=ac0(T),b=ac100(T),v=acOf(T,s);
  var q=comPctOf(T,st.nivel), cmax=comMaxOf(st.prima,T,st.nivel);
  var hasCom=primaOk&&cmax!==null, c=hasCom?cmax*(1-s/100):0;
  var spec=st.mode==="s";
  document.querySelector("input[name=tmode][value='"+st.mode+"']").checked=true;
  $("termY").hidden=spec; $("tSpec").hidden=!spec;
  if(!spec) $("termY").value=T;
  if(document.activeElement!==$("tsY")) $("tsY").value=st.ymd.y;
  if(document.activeElement!==$("tsM")) $("tsM").value=st.ymd.m;
  if(document.activeElement!==$("tsD")) $("tsD").value=st.ymd.d;
  $("termEcho").textContent=spec?(pct(T,2)+" yrs · "+nf(st.days)+" days"):termTxt();
  $("sac").value=sacN(s); $("sacR").value=s;
  if(hasCom){ $("com").value=Math.round(c); $("com").disabled=false; }
  else { $("com").value=""; $("com").disabled=true; }
  $("ac").value=+v.toFixed(3);
  $("comMax").textContent = hasCom
    ? ("Max at "+termTxt()+", level "+st.nivel+": "+fmtM.format(cmax)+" · "+pct(q)+"% of premium")
    : "No calculation until the premium is fixed.";
  $("acBps").textContent=Math.round(v*100)+" bps p.a. · range "+pct(b)+"–"+pct(a)+"%";
  $("curveEcho").textContent=sacTxt(s)+"%";
  var dAc=(a-b)*0.10, dCom=hasCom?cmax*0.10:0;
  $("d10ac").textContent="−"+pct(dAc)+"% ("+Math.round(dAc*100)+" bps)";
  $("d10com").textContent=hasCom?("−"+fmtM.format(dCom)):"—";
  $("d10r").textContent=hasCom?(fmtM2.format(Math.round(dCom/(dAc*100)))+" USD"):"—";
  drawChart(); highlight();
  lock=false;
}
function setS(v){st.s=Math.min(100,Math.max(0,v));render();}
/* Desde el gráfico: términos en cuartos de año. Entero -> modo años;
   si no, término específico con los meses equivalentes. */
function setT(v){v=Math.min(10,Math.max(3,v));
  if(v%1===0) setYears(v); else setSpec(Math.floor(v),Math.round((v%1)*12),0);}

/* ── Eventos ────────────────────────────────────────────────────────── */
for(var ty=3;ty<=10;ty++){var ot=document.createElement("option");
  ot.value=ty;ot.textContent=plural(ty,"year");$("termY").appendChild(ot);}
$("termY").addEventListener("change",function(){setYears(parseInt(this.value,10));});
Array.prototype.forEach.call(document.querySelectorAll("input[name=tmode]"),function(r){
  r.addEventListener("change",function(){
    if(this.value==="y") setYears(Math.min(10,Math.max(3,Math.round(st.T))));
    else setSpec(st.ymd.y,st.ymd.m,st.ymd.d);});});
["tsY","tsM","tsD"].forEach(function(id){$(id).addEventListener("input",function(){
  if(lock) return;
  var g=function(k){var v=$(k).value;return v===""?0:Number(v);};
  setSpec(g("tsY"),g("tsM"),g("tsD"));});});
$("prima").addEventListener("input",function(){if(lock)return;
  st.prima=this.value===""?NaN:parseFloat(this.value); checkPrima(); render();});
$("nivel").addEventListener("change",function(){st.nivel=parseInt(this.value,10);render();});
$("sac").addEventListener("input",function(){if(!lock&&this.value!=="")setS(parseFloat(this.value));});
$("sacR").addEventListener("input",function(){if(!lock)setS(parseFloat(this.value));});
$("com").addEventListener("input",function(){if(lock||!primaOk||this.value==="")return;
  var cmax=comMaxOf(st.prima,st.T,st.nivel); if(!cmax)return;
  setS(100*(1-parseFloat(this.value)/cmax));});
$("ac").addEventListener("input",function(){if(lock||this.value==="")return;
  setS(sacFromAc(st.T,parseFloat(this.value)));});
$("copy").addEventListener("click",function(){
  var T=st.T,cmax=comMaxOf(st.prima,T,st.nivel);
  var txt="Premium "+fmtM.format(st.prima)+" · term "+termTxt()+" · level "+st.nivel+
    " · sacrifice "+sacTxt(st.s)+"%"+
    (cmax===null?"":" → commission "+fmtM.format(cmax*(1-st.s/100)))+
    " · admin charge "+pct(acOf(T,st.s))+"% p.a.";
  var b=this;
  if(!primaOk) txt="Premium outside the accepted range · term "+termTxt()+" · sacrifice "+sacTxt(st.s)+
    "% → admin charge "+pct(acOf(T,st.s))+"% p.a.";
  if(navigator.clipboard){navigator.clipboard.writeText(txt).then(function(){
    b.textContent="Copied";setTimeout(function(){b.textContent="Copy case summary";},1600);});}
});
$("theme").addEventListener("click",function(){
  var r=document.documentElement, cur=r.getAttribute("data-theme");
  var dark=cur?cur==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;
  r.setAttribute("data-theme",dark?"light":"dark"); drawChart();});

buildLevels(); buildMatrix(); checkPrima(); render();
window.addEventListener("resize",function(){drawChart();});
};
