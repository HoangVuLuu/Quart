
const RAW=[['p1','Philippe Nguyen',3,20,'all'],['p2','Amélie Tremblay',3,20,'eve'],['p3','Jasmine Khalil',3,18,'flex'],['p4','Marc-Olivier Roy',3,18,'day'],['p5','Kevin Tran',3,20,'eve'],['p6','Sophie Lapointe',2,14,'eve'],['p7','Rahul Mehta',2,9,'flex'],['p8','Léa Bouchard',2,8,'wknd'],['p9','Camille Fortin',2,8,'day'],['p10','Noah Bergeron',1,8,'wknd'],['p11','Yuki Tanaka',1,6,'day'],['p12','Sarah Gagnon',1,10,'eve'],['p13','Diego Alvarez',1,8,'flex'],['p14','Emma Côté',1,6,'wknd'],['p15',"Liam O'Connor",1,9,'eve']];
const PEOPLE=RAW.map(([id,name,level,desired,pat])=>{const w=name.split(' ');return{id,name,level,desired,pat,first:w[0],short:w[0]+' '+w[w.length-1][0]+'.',initials:w[0][0]+w[w.length-1][0]}});
const BY=Object.fromEntries(PEOPLE.map(p=>[p.id,p]));
const ME='p6',ADMIN='p1',TODAY=1;
const DN=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],DL=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const KIND={o:{name:'Opening',time:'10:00–16:00',h:6,flavor:'#CDD35B',mood:'happy'},c:{name:'Closing',time:'16:00–23:00',h:7,flavor:'#ADA8DA',mood:'sleepy'}};
const COMMENTS={p4:'Exams Oct 12–16, evenings only that week',p8:'Can take more hours in week 2',p12:'No Sundays please, family dinner'};
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function mkPeriod(y,m,d){const out=[];for(let i=0;i<14;i++){const dt=new Date(y,m,d+i);out.push({i,dow:i%7,dn:DN[i%7],dl:DL[i%7],num:dt.getDate(),mon:MN[dt.getMonth()],week:i<7?0:1,label:DN[i%7]+' '+MN[dt.getMonth()]+' '+dt.getDate()})}return out}
const CUR=mkPeriod(2026,8,21),NEXT=mkPeriod(2026,9,5);
const shiftsOf=days=>days.flatMap(d=>['o','c'].map(k=>({id:d.i+'-'+k,d:d.i,k,w:d.week,h:KIND[k].h,day:d})));
const SH_CUR=shiftsOf(CUR),SH_NEXT=shiftsOf(NEXT);
const SMAP_CUR=Object.fromEntries(SH_CUR.map(s=>[s.id,s])),SMAP_NEXT=Object.fromEntries(SH_NEXT.map(s=>[s.id,s]));
function genAvail(days,salt){const out={};PEOPLE.forEach((p,pi)=>{const r=rng(salt*97+pi*13+1),s=new Set();days.forEach(d=>['o','c'].forEach(k=>{const we=d.dow>=5;const pr={all:.9,eve:k==='c'?.95:(we?.5:.1),day:k==='o'?.95:(we?.4:.1),wknd:we?.95:.2,flex:.55}[p.pat];if(r()<pr)s.add(d.i+'-'+k)}));out[p.id]=s});return out}
function generate(sh,avail,seed,locks,maxDays){
  const r=rng(seed),asg={},hrs={},ds={};
  PEOPLE.forEach(p=>{hrs[p.id]=[0,0];ds[p.id]=new Set()});
  sh.forEach(s=>asg[s.id]=[]);
  const add=(pid,s)=>{asg[s.id].push(pid);hrs[pid][s.w]+=s.h;ds[pid].add(s.d)};
  sh.forEach(s=>(locks[s.id]||[]).forEach(pid=>add(pid,s)));
  const run=(pid,d)=>{let n=1;for(let x=d-1;ds[pid].has(x);x--)n++;for(let x=d+1;ds[pid].has(x);x++)n++;return n};
  const cand=s=>PEOPLE.filter(p=>avail[p.id]&&avail[p.id].has(s.id)&&!ds[p.id].has(s.d)&&run(p.id,s.d)<=maxDays&&hrs[p.id][s.w]+s.h<=p.desired+3);
  sh.map(s=>({s,k:cand(s).length+r()*2})).sort((a,b)=>a.k-b.k).forEach(({s})=>{
    while(asg[s.id].length<2){let pool=cand(s);if(!asg[s.id].some(id=>BY[id].level===3)){const l3=pool.filter(p=>p.level===3);if(l3.length)pool=l3}
      if(!pool.length)break;let best=null,bs=1e9;pool.forEach(p=>{const sc=hrs[p.id][s.w]/p.desired+r()*.3;if(sc<bs){bs=sc;best=p}});add(best.id,s)}
  });
  return asg;
}
const hoursOf=(sh,asg,pid,w)=>sh.reduce((t,s)=>t+(s.w===w&&asg[s.id].includes(pid)?s.h:0),0);
function evaluate(sh,asg,avail){
  const out=[];
  sh.forEach(s=>{const a=asg[s.id],lab=s.day.label+' '+KIND[s.k].name.toLowerCase();
    if(!a.some(id=>BY[id].level===3))out.push({sev:'block',sid:s.id,text:lab+': no level 3'});
    if(a.length<2)out.push({sev:'confirm',sid:s.id,text:lab+': '+a.length+' of 2 people'});
    a.forEach(id=>{if(!avail[id])out.push({sev:'confirm',sid:s.id,text:BY[id].first+' is on '+lab+' but never sent availability'});else if(!avail[id].has(s.id))out.push({sev:'confirm',sid:s.id,text:BY[id].first+' is on '+lab+' but is not available'})});
    if(s.k==='c'){const o=asg[s.d+'-o'];a.forEach(id=>{if(o.includes(id))out.push({sev:'show',sid:s.id,text:BY[id].first+' works both shifts on '+s.day.label})})}
  });
  [0,1].forEach(w=>PEOPLE.forEach(p=>{if(!avail[p.id])return;const h=hoursOf(sh,asg,p.id,w);if(h<p.desired-2)out.push({sev:'show',text:p.first+': '+h+' of '+p.desired+' h in week '+(w+1)});if(h>p.desired+2)out.push({sev:'show',text:p.first+': '+h+' h in week '+(w+1)+', wanted '+p.desired})}));
  return out;
}
/* seed the published current period */
const AV_CUR=genAvail(CUR,3);
const PUB0=generate(SH_CUR,AV_CUR,11,{},5);
const works=(asg,pid,d)=>asg[d+'-o'].includes(pid)||asg[d+'-c'].includes(pid);
[3,8,12].forEach(d=>{if(works(PUB0,ME,d))return;const a=PUB0[d+'-c'];if(a.length<2)a.push(ME);else{const i=a.findIndex(id=>BY[id].level<3);a[i>=0?i:1]=ME}});
let OPEN_SID=null;for(const s of SH_CUR){if(s.d>=4&&s.k==='o'&&!works(PUB0,ME,s.d)&&PUB0[s.id].length===2){const a=PUB0[s.id],i=a.findIndex(id=>BY[id].level<3);a.splice(i>=0?i:1,1);OPEN_SID=s.id;break}}
const GIVE0={};for(const s of SH_CUR){if(s.d>=5&&PUB0[s.id].includes('p5')&&!works(PUB0,ME,s.d)){GIVE0[s.id]='p5';break}}
const TRADES0=[];(()=>{const mine=SH_CUR.filter(s=>s.d>=2&&PUB0[s.id].includes(ME));for(const A of mine){const B=SH_CUR.find(s=>s.d>=2&&s.d!==A.d&&PUB0[s.id].includes('p2')&&!works(PUB0,ME,s.d)&&!works(PUB0,'p2',A.d));if(B){TRADES0.push({id:'t0',a:'p2',aShift:B.id,b:ME,bShift:A.id,status:'incoming'});break}}})();
const AV_NEXT=genAvail(NEXT,5);
const NEWS0=[
  {id:'n1',ago:'2 days ago',body:'Fall menu starts Monday. Here is the pumpkin cream foam recipe. Follow the ratios exactly and ask me on shift if anything is unclear.',photos:2,likes:6},
  {id:'n2',ago:'5 days ago',body:'Openers: start the tapioca pot by 9:40 so pearls are ready for 10:00. The timer is on the shelf above the sink.',photos:0,likes:9},
  {id:'n3',ago:'Sep 12',body:'New brown sugar syrup ratio for the station. Old card is in the recycling.',photos:1,likes:11}];
const clone=a=>Object.fromEntries(Object.entries(a).map(([k,v])=>[k,[...v]]));
const on=(b,f)=>({bg:b?'#1B1B22':'#FFFFFF',fg:b?'#FFFFFF':'#1B1B22'});

class Component extends DCLogic {
  state={role:this.props.startAs==='owner'?'admin':'emp',tab:'home',view:'mine',week:0,availWeek:0,sheet:null,toast:null,
    pub:clone(PUB0),give:{...GIVE0},claimants:OPEN_SID?{[OPEN_SID]:['p7']}:{},trades:TRADES0.map(t=>({...t})),
    myAvail:{},availSent:false,comment:'',
    draft:null,seed:1,locks:{},availLocked:false,reopened:{},published:0,dirty:false,
    news:NEWS0.map(n=>({...n})),liked:{},composer:'',composerPhotos:0,
    approveClaims:true,approveTrades:true,fairOpen:true,fairClose:true,maxDays:5};
  toast(msg){clearTimeout(this._t);this.setState({toast:msg});this._t=setTimeout(()=>this.setState({toast:null}),2300)}
  componentWillUnmount(){clearTimeout(this._t)}
  availNext(){const s=this.state,a={...AV_NEXT};a[ME]=s.availSent?new Set(Object.keys(s.myAvail).filter(k=>s.myAvail[k])):null;a.p13=null;return a}
  shiftCard(s,pub){const others=pub[s.id].filter(id=>id!==ME).map(id=>BY[id].short);return{dateText:s.day.dl+' · '+s.day.mon+' '+s.day.num,when:s.d===TODAY?'Today':s.d===TODAY+1?'Tomorrow':s.day.dl,kindName:KIND[s.k].name,time:KIND[s.k].time,hours:KIND[s.k].h,flavor:KIND[s.k].flavor,mood:KIND[s.k].mood,withText:others.length?'With '+others.join(' & '):'Nobody else yet'}}
  applySwap(t){const pub=clone(this.state.pub);pub[t.aShift]=pub[t.aShift].map(id=>id===t.a?t.b:id);pub[t.bShift]=pub[t.bShift].map(id=>id===t.b?t.a:id);return pub}

  generate=()=>{const s=this.state,av=this.availNext(),locks={};
    if(s.draft)Object.keys(s.locks).forEach(k=>{if(!s.locks[k])return;const[sid,pid]=k.split('|');if(s.draft[sid]&&s.draft[sid].includes(pid))(locks[sid]=locks[sid]||[]).push(pid)});
    const seed=s.seed+1;const draft=generate(SH_NEXT,av,seed*7919,locks,s.maxDays);
    this.setState({draft,seed,availLocked:true,dirty:s.published>0});this.toast(s.draft?'Generated again · seed #'+seed:'Draft ready · availability locked')};
  buildByHand=()=>{const d={};SH_NEXT.forEach(x=>d[x.id]=[]);this.setState({draft:d,availLocked:true});this.toast('Empty draft · availability locked')};
  editDraft(sid,fn){const d=clone(this.state.draft);d[sid]=fn(d[sid]);this.setState({draft:d,dirty:this.state.published>0})}
  publish=()=>{const s=this.state,v=s.published+1;this.setState({published:v,dirty:false,sheet:null});this.toast(v===1?'Published v1 · 15 people notified':'Updated to v'+v+' · only changed people notified')};

  renderVals(){
    const s=this.state,isAdmin=s.role==='admin',me=isAdmin?BY[ADMIN]:BY[ME];
    const set=(o)=>this.setState(o);
    const tabDefs=[['home','Home'],['shifts','Schedule'],['avail','Availability'],['requests','Requests'],['news','News']];
    const pub=s.pub;
    /* employee */
    const myShifts=SH_CUR.filter(x=>pub[x.id].includes(ME));
    const nextS=myShifts.find(x=>x.d>=TODAY);
    const openMyShift=id=>()=>set({sheet:{type:'my',id}});
    const hours=hoursOf(SH_CUR,pub,ME,0);
    const openList=SH_CUR.filter(x=>x.d>=TODAY&&(pub[x.id].length<2||(s.give[x.id]&&s.give[x.id]!==ME))).map(x=>{
      const giver=s.give[x.id],mineNow=pub[x.id].includes(ME)&&!giver,waiting=(s.claimants[x.id]||[]).includes(ME);
      const c=this.shiftCard(x,pub);const sameDay=works(pub,ME,x.d)&&!mineNow;
      return{...c,note:giver?'Offered by '+BY[giver].short:pub[x.id].length+' of 2 people',hasWarn:sameDay,warn:'You work the other shift that day.',
        canClaim:!mineNow&&!waiting,hasStatus:mineNow||waiting,status:mineNow?'It’s yours':'Waiting for Philippe',
        claim:()=>{if(s.approveClaims){set({claimants:{...s.claimants,[x.id]:[...(s.claimants[x.id]||[]),ME]}});this.toast('Claim sent to Philippe')}else{const p=clone(pub);if(giver)p[x.id]=p[x.id].map(i=>i===giver?ME:i);else p[x.id].push(ME);const g={...s.give};delete g[x.id];set({pub:p,give:g});this.toast('Shift is yours')}}}});
    const tradeLabel=sid=>{const x=SMAP_CUR[sid];return x.day.label+' · '+KIND[x.k].name};
    const empTrades=s.trades.filter(t=>t.status!=='applied'&&t.status!=='declined'&&t.status!=='cancelled').map(t=>{
      const incoming=t.b===ME;const give=incoming?tradeLabel(t.bShift):tradeLabel(t.aShift),get=incoming?tradeLabel(t.aShift):tradeLabel(t.bShift);
      const other=BY[incoming?t.a:t.b];
      return{title:incoming?other.short+' wants to trade':'You asked '+other.short,give,get,canRespond:incoming&&t.status==='incoming',
        hasStatus:!(incoming&&t.status==='incoming'),status:t.status==='accepted'?'Waiting for Philippe to approve':'Waiting for '+other.first,canCancel:!incoming,
        accept:()=>{if(s.approveTrades){set({trades:s.trades.map(z=>z.id===t.id?{...z,status:'accepted'}:z)});this.toast('Accepted · waiting for Philippe')}else{set({pub:this.applySwap(t),trades:s.trades.map(z=>z.id===t.id?{...z,status:'applied'}:z)});this.toast('Shifts swapped')}},
        decline:()=>{set({trades:s.trades.map(z=>z.id===t.id?{...z,status:'declined'}:z)});this.toast('Trade declined')},
        cancel:()=>{set({trades:s.trades.map(z=>z.id===t.id?{...z,status:'cancelled'}:z)});this.toast('Trade cancelled')}}});
    const availOpen=!s.availLocked||s.reopened[ME];
    const mkAv=(d,k)=>{const id=d.i+'-'+k,v=!!s.myAvail[id];return{on:v,bg:v?'#1B1B22':'#E9EEFD',fg:v?'#FFFFFF':'#1B1B22',shadow:v?'0 3px 0 rgba(0,0,0,.25)':'none',mark:v?'✓':'+',
      toggle:()=>{if(!availOpen){this.toast('Availability is closed');return}set({myAvail:{...s.myAvail,[id]:!v}})}}};
    const picked=Object.keys(s.myAvail).filter(k=>s.myAvail[k]);
    const pickedH=picked.reduce((t,k)=>t+KIND[k.split('-')[1]].h,0);
    const statusKey=s.reopened[ME]?'reopened':s.availSent?'sent':'none';
    const emp={
      hasNext:!!nextS,next:nextS?{...this.shiftCard(nextS,pub),open:openMyShift(nextS.id)}:{},
      hours,desired:BY[ME].desired,hoursPct:Math.min(100,Math.round(hours/BY[ME].desired*100))+'%',openCount:openList.length,
      availLine:s.availSent?'Sent · '+picked.length+' shifts. You can still edit.':'Due Friday · takes a minute',availCta:s.availSent?'Edit':'Fill in',
      viewMine:s.view==='mine',viewTeam:s.view==='team',
      mine:myShifts.filter(x=>x.w===s.week).map(x=>({...this.shiftCard(x,pub),offered:s.give[x.id]===ME,opacity:x.d<TODAY?'.55':'1',open:openMyShift(x.id)})),
      team:CUR.filter(d=>d.week===s.week).map(d=>{const f=k=>pub[d.i+'-'+k].map(id=>id===ME?'You':BY[id].short).join(', ')||'Open';return{dn:d.dn,mon:d.mon,num:d.num,oText:f('o'),cText:f('c'),bg:d.i===TODAY?'#EEF2FE':'transparent'}}),
      availDays:NEXT.filter(d=>d.week===s.availWeek).map(d=>({dn:d.dn,mon:d.mon,num:d.num,o:mkAv(d,'o'),c:mkAv(d,'c')})),
      availOpen,availLocked:!availOpen,comment:s.comment,commentCount:s.comment.length,
      statusText:{none:'Not sent',sent:'✓ Sent',reopened:'Reopened'}[statusKey],statusBg:{none:'#FDE1E6',sent:'#DDF3E4',reopened:'#FFF0C9'}[statusKey],statusFg:{none:'#8E1A33',sent:'#11643A',reopened:'#6B4A00'}[statusKey],
      availSummary:picked.length+' shifts · '+pickedH+' h',sendLabel:s.availSent&&!s.reopened[ME]?'Resend':'Send',
      open:openList,noOpen:!openList.length,trades:empTrades,noTrades:!empTrades.length};
    emp.mineEmpty=!emp.mine.length;

    /* admin */
    const av=this.availNext();
    const sentN=PEOPLE.filter(p=>av[p.id]).length;
    const iss=s.draft?evaluate(SH_NEXT,s.draft,av):[];
    const blockN=iss.filter(i=>i.sev==='block').length;
    const issueSids=new Set(iss.filter(i=>i.sid&&i.sev!=='show').map(i=>i.sid));
    const stage=s.published?(s.dirty?'Published v'+s.published+' · edits not live':'Published v'+s.published):s.draft?'Draft · only you can see it':'Collecting availability';
    const adNext=SH_CUR.find(x=>x.d>=TODAY&&pub[x.id].includes(ADMIN));
    const claimList=Object.entries(s.claimants).filter(([,v])=>v.length).map(([sid,pids])=>{const x=SMAP_CUR[sid],giver=s.give[sid];return{label:x.day.label+' · '+KIND[x.k].name,flavor:KIND[x.k].flavor,
      note:(giver?'Offered by '+BY[giver].short:'Open slot')+' · '+pids.length+(pids.length>1?' people want it':' person wants it'),
      people:pids.map(pid=>({name:BY[pid].name,first:BY[pid].first,level:BY[pid].level,hours:hoursOf(SH_CUR,pub,pid,x.w)+'/'+BY[pid].desired+' h',
        pick:()=>{const p=clone(pub);if(giver)p[sid]=p[sid].map(i=>i===giver?pid:i);else p[sid].push(pid);const g={...s.give};delete g[sid];const c={...s.claimants};delete c[sid];set({pub:p,give:g,claimants:c});this.toast(BY[pid].first+' gets it · others declined')}}))}});
    const admTrades=s.trades.filter(t=>t.status==='accepted').map(t=>({text:BY[t.a].short+' ('+tradeLabel(t.aShift)+') ⇄ '+BY[t.b].short+' ('+tradeLabel(t.bShift)+')',
      approve:()=>{set({pub:this.applySwap(t),trades:s.trades.map(z=>z.id===t.id?{...z,status:'applied'}:z)});this.toast('Trade approved · shifts swapped')},
      decline:()=>{set({trades:s.trades.map(z=>z.id===t.id?{...z,status:'declined'}:z)});this.toast('Trade declined')}}));
    const pendingCount=claimList.length+admTrades.length;
    const openAdminShift=sid=>()=>set({sheet:{type:'adm',id:sid}});
    const adm={
      stageTitle:s.published?stage:s.draft?'Draft in progress':'Collecting availability',
      sentText:sentN+' of 15 sent',sentPct:Math.round(sentN/15*100)+'%',
      homeCta:s.draft?'Open the draft':'Build the schedule',
      issueCountText:s.draft?String(iss.length):'—',blockText:s.draft?(blockN?blockN+' blocking':'none blocking'):'No draft yet',
      pendingCount,hasNext:!!adNext,next:adNext?this.shiftCard(adNext,pub):{},
      statusText:stage,noDraft:!s.draft,hasDraft:!!s.draft,seed:s.seed,
      issueBtn:iss.length?iss.length+' issues':'No issues',issueBg:blockN?'#FDE1E6':'#FFFFFF',issueFg:blockN?'#8E1A33':'#1B1B22',
      showPublish:!s.published||s.dirty,publishLabel:s.published?'Update to v'+(s.published+1):'Publish',
      days:s.draft?NEXT.filter(d=>d.week===s.week).map(d=>({label:d.dl+' · '+d.mon+' '+d.num,shifts:['o','c'].map(k=>{const sid=d.i+'-'+k,a=s.draft[sid],bad=issueSids.has(sid);
        const noL3=!a.some(id=>BY[id].level===3);
        return{open:openAdminShift(sid),kindName:KIND[k].name,time:KIND[k].time,flavor:KIND[k].flavor,mood:a.length<2?'wow':KIND[k].mood,fill:a.length+'/2',
          fillBg:a.length<2?'#FDE1E6':'#DDF3E4',fillFg:a.length<2?'#8E1A33':'#11643A',border:bad?'#F48DA0':'transparent',
          hasTag:noL3||bad,tag:noL3?'No level 3':'Check availability',
          names:a.map(id=>({name:BY[id].short,level:BY[id].level,lockText:s.locks[sid+'|'+id]?'KEPT':'',color:av[id]&&av[id].has(sid)?'#1B1B22':'#C0284A'}))}})})):[],
      lockedNote:s.availLocked,
      team:PEOPLE.map(p=>{const a=av[p.id],re=s.reopened[p.id];const st=re?'Reopened':a?'Sent':'Not sent';
        return{name:p.name,initials:p.initials,level:p.level,detail:a?a.size+' shifts · wants '+p.desired+' h/wk':'No answer yet · wants '+p.desired+' h/wk',
          hasComment:!!(a&&(COMMENTS[p.id]||(p.id===ME&&s.comment))),comment:p.id===ME?s.comment:COMMENTS[p.id],
          status:(a?'✓ ':'? ')+st,bg:re?'#FFF0C9':a?'#DDF3E4':'#FDE1E6',fg:re?'#6B4A00':a?'#11643A':'#8E1A33',
          canAct:s.availLocked?!re:!a,actLabel:s.availLocked?'Reopen':'Remind',
          act:()=>{if(s.availLocked){set({reopened:{...s.reopened,[p.id]:true}});this.toast('Reopened for '+p.first)}else this.toast('Reminder sent to '+p.first)}}}),
      claims:claimList,noClaims:!claimList.length,trades:admTrades,noTrades:!admTrades.length};

    /* sheet */
    const sh={};const sheet=s.sheet;
    if(sheet&&sheet.type==='my'){const x=SMAP_CUR[sheet.id],offered=s.give[x.id]===ME;sh.isMyShift=true;sh.my={...this.shiftCard(x,pub),offered,giveLabel:offered?'Take it back':'Give away',
      toggleGive:()=>{const g={...s.give};if(offered)delete g[x.id];else g[x.id]=ME;set({give:g,sheet:null});this.toast(offered?'Taken back':'Posted · you stay on it until someone takes it')},
      trade:()=>set({sheet:{type:'trade',id:x.id}})}}
    if(sheet&&sheet.type==='trade'){const A=SMAP_CUR[sheet.id];sh.isTrade=true;sh.tradeFrom=A.day.dn+' '+KIND[A.k].name.toLowerCase();
      sh.tradeOpts=SH_CUR.filter(x=>x.d>TODAY&&x.d!==A.d&&!works(pub,ME,x.d)).flatMap(x=>pub[x.id].filter(id=>!works(pub,id,A.d)).map(id=>({x,id}))).slice(0,8).map(({x,id})=>({who:BY[id].name,label:x.day.label+' · '+KIND[x.k].name+' '+KIND[x.k].time,flavor:KIND[x.k].flavor,mood:KIND[x.k].mood,
        pick:()=>{set({trades:[...s.trades,{id:'t'+Date.now(),a:ME,aShift:A.id,b:id,bShift:x.id,status:'requested'}],sheet:null,tab:'requests'});this.toast('Trade request sent to '+BY[id].first)}}))}
    if(sheet&&sheet.type==='adm'&&s.draft){const x=SMAP_NEXT[sheet.id],a=s.draft[x.id],hasL3=a.some(id=>BY[id].level===3);sh.isAdminShift=true;
      const hrs=pid=>hoursOf(SH_NEXT,s.draft,pid,x.w)+'/'+BY[pid].desired+' h this week';
      const stat=pid=>!av[pid]?'none':av[pid].has(x.id)?'yes':'no';
      sh.as={title:x.day.dl+' '+x.day.mon+' '+x.day.num+' · '+KIND[x.k].name,time:KIND[x.k].time,fill:a.length+'/2',flavor:KIND[x.k].flavor,mood:a.length<2?'wow':KIND[x.k].mood,
        needText:hasL3?'✓ Needs 1 level 3 — covered':'× Needs 1 level 3 — missing (blocks publishing)',needBg:hasL3?'#DDF3E4':'#FDE1E6',needFg:hasL3?'#11643A':'#8E1A33',empty:!a.length,
        roster:a.map(pid=>{const k=x.id+'|'+pid,lk=!!s.locks[k],st=stat(pid);return{name:BY[pid].name,level:BY[pid].level,color:st==='yes'?'#1B1B22':'#C0284A',
          detail:hrs(pid)+(st==='no'?' · not available':st==='none'?' · never sent':''),lockLabel:lk?'Kept':'Keep',lockBg:lk?'#1B1B22':'#FFFFFF',lockFg:lk?'#FFFFFF':'#1B1B22',
          lock:()=>set({locks:{...s.locks,[k]:!lk}}),remove:()=>{const l={...s.locks};delete l[k];set({locks:l});this.editDraft(x.id,r=>r.filter(i=>i!==pid))}}}),
        cands:PEOPLE.filter(p=>!a.includes(p.id)).map(p=>{const st=stat(p.id),same=works(s.draft,p.id,x.d);return{p,st,same,r:(st==='yes'?0:st==='none'?2:1)+(same?3:0)+hoursOf(SH_NEXT,s.draft,p.id,x.w)/p.desired*.9}}).sort((m,n)=>m.r-n.r).map(({p,st,same})=>({
          name:p.name,level:p.level,hours:hoursOf(SH_NEXT,s.draft,p.id,x.w)+'/'+p.desired+' h',
          status:same?'Works the other shift':{yes:'✓ Available',no:'× Not available',none:'? No answer'}[st],
          bg:same?'#FFF0C9':{yes:'#DDF3E4',no:'#FDE1E6',none:'#ECEDF3'}[st],fg:same?'#6B4A00':{yes:'#11643A',no:'#8E1A33',none:'#4A4F66'}[st],
          hasComment:!!(av[p.id]&&COMMENTS[p.id]),comment:COMMENTS[p.id],
          add:()=>{if(a.length>=2){this.toast('Shift is full · remove someone first');return}this.editDraft(x.id,r=>[...r,p.id]);this.toast(p.first+' added'+(st!=='yes'?' · flagged':''))}}))}}
    if(sheet&&sheet.type==='issues'){sh.isIssues=true;const order={block:0,confirm:1,show:2};sh.issues=[...iss].sort((a,b)=>order[a.sev]-order[b.sev]).map(i=>({text:i.text,sev:{block:'Blocks',confirm:'Asks',show:'Info'}[i.sev],
      bg:{block:'#FDE1E6',confirm:'#FFF0C9',show:'#FFFFFF'}[i.sev],fg:{block:'#8E1A33',confirm:'#6B4A00',show:'#4A4F66'}[i.sev],cursor:i.sid?'pointer':'default',
      open:()=>{if(i.sid)set({sheet:{type:'adm',id:i.sid},week:SMAP_NEXT[i.sid].w})}}));sh.noIssues=!iss.length}
    if(sheet&&sheet.type==='publish'){sh.isPublish=true;const conf=iss.filter(i=>i.sev==='confirm').length;const v=s.published?'Update to v'+(s.published+1):'Publish v1';
      sh.pub=blockN?{title:'Not yet',body:blockN+' shift'+(blockN>1?'s have':' has')+' no level 3. Fix those first; everything else can wait.',canGo:false,blocked:true,flavor:'#C9A07A',mood:'wow',cta:''}
        :{title:conf?'Publish with '+conf+' things to check?':'Looks good!',body:(conf?'Open slots become open shifts the team can claim. ':'')+(s.published?'Only people whose shifts changed get notified.':'Everyone gets notified and sees their shifts.'),canGo:true,blocked:false,flavor:'#CDD35B',mood:'happy',cta:conf?v+' anyway':v}}
    if(sheet&&sheet.type==='settings')sh.isSettings=true;
    const tog=(key,label,sub)=>({label,sub,on:s[key],justify:s[key]?'flex-end':'flex-start',track:s[key]?'#1B1B22':'#C9CEE2',toggle:()=>set({[key]:!s[key]})});
    const latest=s.news[0]||{ago:'',body:'No posts yet.'};
    return{
      isAdmin,isEmp:!isAdmin,meFirst:me.first,meInitials:me.initials,
      roleEmpBg:isAdmin?'#FFFFFF':'#1B1B22',roleEmpFg:isAdmin?'#1B1B22':'#FFFFFF',roleAdmBg:isAdmin?'#1B1B22':'#FFFFFF',roleAdmFg:isAdmin?'#FFFFFF':'#1B1B22',
      asEmp:()=>set({role:'emp',sheet:null,week:0}),asAdmin:()=>set({role:'admin',sheet:null,week:0}),
      tabHome:s.tab==='home',tabShifts:s.tab==='shifts',tabAvail:s.tab==='avail',tabRequests:s.tab==='requests',tabNews:s.tab==='news',
      tabs:tabDefs.map(([k,l])=>{const b=k==='requests'?(isAdmin?pendingCount:empTrades.filter(t=>t.canRespond).length):0;return{label:l,...on(s.tab===k),hasBadge:b>0,badge:b,on:()=>set({tab:k,sheet:null})}}),
      goRequests:()=>set({tab:'requests'}),goAvail:()=>set({tab:'avail'}),goNews:()=>set({tab:'news'}),goShifts:()=>set({tab:'shifts'}),
      viewPills:[['mine','My shifts'],['team','Whole team']].map(([k,l])=>({label:l,...on(s.view===k),on:()=>set({view:k})})),
      weekPills:[0,1].map(w=>({label:'Week '+(w+1),...(s.week===w?{bg:'#7F9FF2',fg:'#1B1B22'}:{bg:'#FFFFFF',fg:'#1B1B22'}),on:()=>set({week:w})})),
      availWeekPills:[0,1].map(w=>({label:(w?'Oct 12–18':'Oct 5–11'),...(s.availWeek===w?{bg:'#7F9FF2',fg:'#1B1B22'}:{bg:'#FFFFFF',fg:'#1B1B22'}),on:()=>set({availWeek:w})})),
      sameAsLast:()=>{if(!availOpen)return;const m={};NEXT.forEach(d=>{m[d.i+'-c']=d.dow!==6;if(d.dow===5)m[d.i+'-o']=true});set({myAvail:m});this.toast('Loaded last period · review before sending')},
      copyWeek:()=>{if(!availOpen)return;const m={...s.myAvail};NEXT.filter(d=>d.week===0).forEach(d=>['o','c'].forEach(k=>m[(d.i+7)+'-'+k]=!!m[d.i+'-'+k]));set({myAvail:m,availWeek:1});this.toast('Week 1 copied to week 2')},
      onComment:e=>set({comment:e.target.value.slice(0,500)}),
      sendAvail:()=>{if(!picked.length){this.toast('Tap at least one shift first');return}const r={...s.reopened};delete r[ME];set({availSent:true,reopened:r});this.toast('Availability sent to Philippe')},
      reqSub:isAdmin?(pendingCount?pendingCount+' waiting on you':'All caught up'):'Give away, claim and trade',
      emp,adm,sh,hasSheet:!!(sheet&&(sheet.type!=='adm'||s.draft)),closeSheet:()=>set({sheet:null}),
      openIssues:()=>set({sheet:{type:'issues'}}),openPublish:()=>set({sheet:{type:'publish'}}),openSettings:()=>set({sheet:{type:'settings'}}),
      generate:this.generate,buildByHand:this.buildByHand,publish:this.publish,
      copyCode:()=>{try{navigator.clipboard.writeText('PRESTEA24X')}catch(e){}this.toast('Join code copied')},
      settingsRows:[tog('approveClaims','Approve claims','Otherwise the first claim wins'),tog('approveTrades','Approve trades','After the coworker accepts'),tog('fairOpen','Spread openings fairly','Proportional to availability'),tog('fairClose','Spread closings fairly','Proportional to availability')],
      maxDays:s.maxDays,maxDown:()=>set({maxDays:Math.max(1,s.maxDays-1)}),maxUp:()=>set({maxDays:Math.min(7,s.maxDays+1)}),
      hasToast:!!s.toast,toast:s.toast,
      latest,
      news:s.news.map(n=>{const l=!!s.liked[n.id];return{...n,hasPhotos:n.photos>0,photos:Array.from({length:n.photos},(_,i)=>({i})),likes:n.likes+(l?1:0),liked:l,likeBg:l?'#1B1B22':'#E9EEFD',likeFg:l?'#FFFFFF':'#1B1B22',
        like:()=>set({liked:{...s.liked,[n.id]:!l}}),del:()=>{set({news:s.news.filter(z=>z.id!==n.id)});this.toast('Post and photos deleted')}}}),
      composer:s.composer,onComposer:e=>set({composer:e.target.value}),composerPhotoCount:s.composerPhotos,hasComposerPhotos:s.composerPhotos>0,composerPhotos:Array.from({length:s.composerPhotos},(_,i)=>({i})),
      addPhoto:()=>{if(s.composerPhotos>=6){this.toast('Up to 6 photos per post');return}set({composerPhotos:s.composerPhotos+1})},
      postNews:()=>{if(!s.composer.trim()&&!s.composerPhotos){this.toast('Write something or add a photo');return}set({news:[{id:'n'+Date.now(),ago:'Just now',body:s.composer.trim(),photos:s.composerPhotos,likes:0},...s.news],composer:'',composerPhotos:0});this.toast('Posted · team notified')}
    };
  }
}
