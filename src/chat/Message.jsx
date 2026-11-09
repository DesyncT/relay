import { memo, useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { call } from '../api.js';
import { getState, setState, useStore } from '../store.js';
import { spring, ease } from '../motion.js';
import { Avatar, CARET, FileIco, Html, Ico, Pair, RtBadge, fileUrl, openFile, provLogo } from './bits.jsx';
import { answerAsk, getChat, replyTo } from './chatStore.js';
import { openLightbox, lbId } from './lightbox.jsx';
import { disp, fcost, fsize, ftok, hm, isImg, linkedImages, md, messageProvider, nameColor, stamp, visibleSpeaker } from './md.js';

let noticeTimer;
function notify(text) { // same #appNotice toast the legacy notifyUI used
  let n = document.getElementById('appNotice');
  if (!n) { n = document.createElement('div'); n.id = 'appNotice'; n.setAttribute('role', 'status'); document.body.append(n); }
  n.textContent = text; n.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { n.hidden = true; }, 3000);
}

// ---- jump to a message (reply line, "View request") and flash it in the speaker color ----
export function jump(r) {
  const it = [...getChat().items].reverse().find((x) => x.m && x.m.from === r.from && (r.at ? x.m.at === r.at : (x.m.text || '').slice(0, 120) === r.text));
  const t = it && document.querySelector(`#log [data-mid="${it.id}"]`);
  if (!t) return;
  t.scrollIntoView({ behavior: 'smooth', block: 'center' });
  t.style.setProperty('--fl', nameColor(r.from)); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
}

// ---- attachments ----
function Att({ a }) {
  const id = useId();
  if (isImg(a)) {
    const src = fileUrl(a.path);
    return <motion.img layoutId={lbId(id)} src={src} alt={a.name} title={a.name} onClick={() => openLightbox(src, a.name, id)} whileHover={{ scale: 1.02 }} transition={spring} />;
  }
  return (
    <div className="fcard"><FileIco /><div><div className="fn">{a.name}</div><div className="fs">{fsize(a.size)}</div></div>
      <button className="b ghost" onClick={() => call('chat:open', a.path)}>Open</button></div>
  );
}
function Thumb({ p }) { // Panels.imageFromPath
  const [big, setBig] = useState(false), [bad, setBad] = useState(false);
  if (bad) return null;
  return <img className={'pn-thumb' + (big ? ' big' : '')} src={fileUrl(p)} alt={String(p).split(/[\\/]/).pop()} loading="lazy" onClick={() => setBig(!big)} onError={() => setBad(true)} />;
}
const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const IMGX = /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i;
function FileCard({ p }) { // Panels.fileCard
  const name = String(p).split(/[\\/]/).pop(), img = IMGX.test(name);
  const [st, setSt] = useState(null);
  const [badImg, setBadImg] = useState(false);
  useEffect(() => { call('panel:file:stat', getState().openSid, p).then((r) => setSt(r && !r.error ? r : { missing: true })).catch(() => {}); }, [p]);
  const meta = !st ? (name.split('.').pop() || 'file').toUpperCase() : st.missing ? 'Not found' : fmtSize(st.size) + ' · ' + (st.ext || 'file').toUpperCase();
  return (
    <motion.button type="button" className="fc-card" aria-label={'Open ' + name} onClick={() => openFile(p)} whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }}>
      {img && st?.url && !badImg && <img alt={name} loading="lazy" src={st.url} onError={() => setBadImg(true)} />}
      <div className="fc-row"><Ico d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" /><div className="fc-info"><div className="fc-name">{name}</div><div className="fc-meta">{meta}</div></div></div>
    </motion.button>
  );
}
const ACT_IMG = /\.(png|jpe?g|webp|gif|svg)$/i, ACT_CARD = /\.(html?|md|pdf|png|jpe?g|webp|gif|svg)$/i;
function FileCards({ m }) {
  const paths = [...(m.files || [])];
  for (const a of m.activity || []) if ((a.kind === 'create' || a.kind === 'edit') && a.abs && ACT_CARD.test(a.abs) && !paths.includes(a.abs)) paths.push(a.abs);
  const seen = new Set([...(m.attachments || []).map((a) => a.path), ...paths].map((p) => p.replace(/\\/g, '/')));
  const images = linkedImages(m.text).filter((a) => { const key = a.path.replace(/\\/g, '/'); if (seen.has(key)) return false; seen.add(key); return true; });
  if (!paths.length && !images.length) return null;
  return <div className="atts">{images.slice(0, 6).map((a) => <Att key={a.path} a={a} />)}{paths.slice(0, 6).map((p) => <FileCard key={p} p={p} />)}</div>;
}

// ---- activity rows: what an agent created / edited / ran ----
function ActRow({ head, expand }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={'ar' + (open ? ' open' : '')}>
      <button className="ar-h" style={expand ? undefined : { cursor: 'default' }} aria-expanded={expand ? open : undefined} onClick={expand ? () => setOpen(!open) : undefined}>
        {head}{expand && <span className="ar-c"><Ico d={CARET} size={12} /></span>}
      </button>
      <AnimatePresence initial={false}>
        {open && expand && <motion.div key="b" className="ar-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease }} style={{ overflow: 'hidden' }}>{expand()}</motion.div>}
      </AnimatePresence>
    </div>
  );
}
const VERB = { create: 'Created', edit: 'Edited', delete: 'Deleted' };
function ActList({ list }) {
  const [all, setAll] = useState(false);
  const rows = list.filter((x) => x.kind !== 'cmd').map((a, i) => (
    <ActRow key={'f' + i} head={<>{VERB[a.kind] || 'Edited'} <b className="f">{a.file}</b>{a.add ? <span className="p">+{a.add}</span> : null}{a.del ? <span className="m">−{a.del}</span> : null}</>}
      expand={a.diff ? () => <pre className="ar-diff">{a.diff.split('\n').map((l, j) => <span key={j} className={l[0] === '+' ? 'dp' : l[0] === '-' ? 'dm' : ''}>{l || ' '}</span>)}</pre> : null} />));
  const cmds = list.filter((x) => x.kind === 'cmd');
  if (cmds.length) {
    const bg = cmds.filter((x) => x.bg).length, label = cmds.length === 1 ? (bg ? 'Ran background command ' : 'Ran ') + cmds[0].cmd.split('\n')[0] : bg === cmds.length ? `${bg} background commands completed` : `Ran ${cmds.length} commands`;
    rows.push(<ActRow key="cmds" head={<span className="ar-t">{label}</span>} expand={() => <pre className="ar-diff">{cmds.map((x, i) => <span key={i} className={x.code ? 'dm' : ''}>{`$ ${x.cmd}${x.code != null ? `   exit ${x.code}` : ''}`}</span>)}</pre>} />);
  }
  return <div className="act-list">{all ? rows : rows.slice(0, 5)}{!all && rows.length > 5 && <button className="ar-more" onClick={() => setAll(true)}>Show {rows.length - 5} more</button>}</div>;
}

// ---- ask: answer buttons ----
function ChoiceBar({ opts, info, cls = '', live }) {
  const [done, setDone] = useState(false);
  return (
    <motion.div className={('opts ' + cls).trim()} role="group" aria-label="Choices" initial="h" animate="s" variants={{ s: { transition: { staggerChildren: live ? 0.06 : 0, delayChildren: live ? 0.15 : 0 } } }}>
      {opts.map((o, i) => (
        <motion.button key={i} type="button" className={'opt' + (i ? '' : ' pri')} title={info?.[i] || ''} disabled={done}
          variants={{ h: { opacity: live ? 0 : 1, y: live ? 8 : 0 }, s: { opacity: 1, y: 0, transition: { duration: 0.3, ease } } }}
          whileHover={done ? undefined : { y: -1 }} whileTap={done ? undefined : { scale: 0.98 }}
          onClick={(e) => { e.stopPropagation(); setDone(true); answerAsk(o); }}>
          <span className="opt-copy"><span>{o}</span>{info?.[i] ? <small>{info[i]}</small> : null}</span>
        </motion.button>
      ))}
    </motion.div>
  );
}

function Actions({ m }) {
  const mk = (title, icon, fn) => <motion.button className="act" title={title} aria-label={title} onClick={fn} whileTap={{ scale: 0.88 }}>{icon}</motion.button>;
  return (
    <div className="acts">
      {m.usage && <span className="u">{m.usage.cost ? fcost(m.usage.cost) + ' · ' : ''}{ftok(m.usage.tokens)} tok</span>}
      {mk('Reply', <Ico><path d="M9 17 4 12l5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></Ico>, () => replyTo(m))}
      {mk('Copy text', <Ico><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></Ico>, async () => {
        try { await navigator.clipboard.writeText(m.text || ''); notify('Message copied'); } catch { notify('Could not copy. Select the message text to copy it.'); }
      })}
    </div>
  );
}

// ---- auto approvals, judges, review context ----
function AutoBody({ m, profile, isOpen, live }) {
  const votes = (m.text || '').split('\n').map((line) => {
    const v = /^([^:]+): (.+?) — (.*)$/.exec(line);
    if (v) return { name: v[1], pick: v[2], reason: v[3] };
    const missing = /^([^:]+): no answer$/.exec(line);
    return missing ? { name: missing[1], pick: '', reason: 'No response received' } : null;
  }).filter(Boolean);
  if (!votes.length) return <Html className="body" html={md(m.text || '', profile.name)} />;
  const agreed = m.auto === 'agree', binary = votes.every((v) => /^(yes|go|no)?$/i.test(v.pick));
  const approved = votes.filter((v) => /^(yes|go)$/i.test(v.pick)).length;
  const count = binary ? `${approved} of ${votes.length} approved` : `${votes.length} independent judgments`;
  return (
    <details className={'approval-card' + (agreed ? ' approved' : '')}>
      <summary><span className="approval-mark"><Ico d={agreed ? 'm5 12 4 4L19 6' : 'M9 5v14M15 5v14'} /></span><span className="approval-title">{agreed ? 'Auto-approved' : 'Your decision needed'}</span><span className="approval-count">{count}</span><span className="approval-disclosure">Reasons</span></summary>
      <div className="approval-votes">
        {votes.map((v, i) => {
          const role = v.name.replace(/\s*\([^)]*\)\s*$/, ''), model = /\(([^)]+)\)/.exec(v.name)?.[1] || '';
          const decision = /^(yes|go)$/i.test(v.pick) ? 'Approve' : /^no$/i.test(v.pick) ? 'Decline' : v.pick || 'No response';
          return <div className="approval-vote" key={i}><span className="approval-role" title={model}>{role}</span><span className={'approval-pick' + (/^no$/i.test(v.pick) ? ' declined' : '')}>{decision}</span><span className="approval-reason">{v.reason || 'No reason provided'}</span></div>;
        })}
      </div>
      {!agreed && isOpen && <ChoiceBar opts={m.options?.length ? m.options : ['Approve', 'Decline']} cls="approval-actions" live={live} />}
    </details>
  );
}
function Judge({ m, profile }) {
  const legacy = /^Review (\d+), round (\d+): (PASS|FAIL|UNKNOWN)\s*\n?([\s\S]*)/.exec(m.text || '');
  const role = m.review?.role || (legacy ? ['Correctness', 'Requirements', 'Edge cases', 'Safety', 'Usability'][Number(legacy[1]) - 1] || 'Review' : 'Approval');
  const verdict = m.review?.verdict || legacy?.[3] || 'UNKNOWN';
  const evidence = (legacy?.[4] || m.text || '').replace(/^EVIDENCE:\s*/i, '').trim();
  return (
    <details className="judge-detail">
      <summary><span className="judge-role">{role}</span><span className={'judge-verdict ' + verdict.toLowerCase()}>{verdict === 'PASS' ? 'Passed' : verdict === 'FAIL' ? 'Needs changes' : 'Unverified'}</span><span className="judge-preview">{evidence.split('\n')[0].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '').slice(0, 140)}</span></summary>
      <Html className="judge-evidence" html={md(evidence, profile.name)} />
    </details>
  );
}
function ReviewContext({ context, inferred, profile }) {
  return (
    <div className="review-context">
      <div className="review-context-title"><span>{inferred ? 'Related request' : 'Reviewing'}</span><span className="review-context-meta">{[context.count ? context.count + ' checks' : '', context.round ? 'Round ' + context.round : '', context.model || ''].filter(Boolean).join(' · ')}</span>
        {context.requestAt && <button className="review-context-back" onClick={() => jump({ from: 'user', at: context.requestAt })}>View request</button>}</div>
      <div className="review-context-request">{context.request || 'Request not recorded'}</div>
      {context.files?.length ? <div className="review-context-files">{context.files.map((f) => <button key={f} title={f} onClick={() => openFile(f)}>{String(f).split(/[\\/]/).pop()}</button>)}</div> : null}
      {context.result && <details className="review-context-result"><summary>Result being checked</summary><Html html={md(context.result, profile.name)} /></details>}
      {inferred && <div className="review-context-meta">Earlier review: exact scope and files were not recorded</div>}
    </div>
  );
}

// ---- failure card ----
const RETRY_D = 'M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M16 21h5v-5';
function FailureCard({ m }) {
  const cfg = useStore((s) => s.chatCfg || s.cfg);
  const sid = useStore((s) => s.openSid);
  const [busy, setBusy] = useState('');
  const fmt = window.formatFailureInfo;
  let f = m.failure;
  if (!f) {
    let prov = 'claude', text = m.text || '';
    const mm = /^(?:subagent\s+"?([^"]+)"?\s+failed:|(claude|codex|antigravity)\s+failed:)\s*([\s\S]*)$/i.exec(text);
    if (mm) { prov = mm[2] ? mm[2].toLowerCase() : 'claude'; text = mm[3] || text; }
    f = fmt ? fmt(text, prov) : { provider: prov, title: 'Command failed', message: text, badge: 'red', action: 'retry' };
    if (mm && mm[1]) f = { ...f, title: `Subagent "${mm[1]}" failed` };
  }
  const prov = f.provider || 'claude', badge = f.badge || 'red';
  const label = (p) => p === 'claude' ? 'Claude' : p === 'antigravity' ? 'Antigravity' : 'Codex';
  const fix = f.fix || (fmt ? fmt(f.raw || f.message, prov).fix : '');
  const recovery = fmt ? fmt(f.raw || f.message, prov) : f;
  const disabled = cfg?.disabledProviders || [];
  const alts = ['claude', 'codex', 'antigravity'].filter((p) => p !== prov && !disabled.includes(p));
  const alt = alts[0] || (prov === 'claude' ? 'codex' : 'claude');
  const retry = async (target, key, setLead) => {
    if (!sid) return;
    setBusy(key);
    try {
      if (setLead) {
        const info = getState().chatSessionInfo;
        setState({ chatSessionInfo: info && { ...info, lead: target } });
        call('settings:save', { lead: target }); call('sessions:update', sid, { lead: target });
      }
      await call('chat:retry', sid, target);
    } catch (e) { alert(e.message); } finally { setBusy(''); }
  };
  return (
    <div className="msg grp fcard-row">
      <div className={'fcard-box ' + badge}>
        <div className="fcard-head">
          <span className={'fcard-badge ' + badge}><span className="fcard-badge-icon">{provLogo(prov)}</span><span>{label(prov)}</span></span>
          <b className="fcard-title">{f.title || 'Command failed'}</b><span className="fcard-time">{hm(m.at || Date.now())}</span>
        </div>
        <div className="fcard-body">{f.message}{fix && <p>Suggested fix: {fix}</p>}</div>
        <div className="fcard-actions">
          {f.action === 'install' && <button className="b failure-btn" type="button" onClick={() => call('auth:install', prov).catch(() => {})}>Install {label(prov)} CLI</button>}
          {(f.canSignInAgain || recovery.canSignInAgain) && <button className="b failure-btn" type="button" disabled={busy === 'sign'} title="Sign out of the Codex CLI on this PC and open sign-in to choose your account"
            onClick={async () => { setBusy('sign'); try { await call('auth:logout', 'codex'); await call('auth:login', 'codex'); } catch (e) { alert(e.message); } finally { setBusy(''); } }}>{busy === 'sign' ? 'Opening sign-in...' : 'Sign in again'}</button>}
          <button className="b failure-btn retry-btn" type="button" disabled={busy === 'retry'} onClick={() => retry(prov, 'retry')}><span><Ico d={RETRY_D} /></span><span>{busy === 'retry' ? 'Retrying...' : 'Retry'}</span></button>
          <button className="b failure-btn switch-btn" type="button" disabled={busy === 'switch'} onClick={() => retry(alt, 'switch', true)}><span>{provLogo(alt, 12)}</span><span>{busy === 'switch' ? 'Switching...' : 'Switch to ' + label(alt)}</span></button>
        </div>
      </div>
    </div>
  );
}

// ---- one row of the log ----
// Conversation text must paint at full opacity, including newly received messages.
const rowMotion = () => ({ initial: false });

// DOM nodes handed to addSystemCard are mounted into a ref'd wrapper
function Mount({ node }) {
  return <div ref={(el) => { if (el && node.parentNode !== el) el.replaceChildren(node); }} />;
}

function Row({ row, isOpen }) {
  const profile = useStore((s) => s.profile);
  const mo = rowMotion(row), m = row.m;
  if (row.kind === 'card') {
    return (
      <motion.div className="msg grp xcard" data-mid={row.id} {...mo}>
        <div className="av sys"><Pair size="100%" /></div>
        <div className="hd"><b className="nm" style={{ color: 'var(--text-2)' }}>Relay</b><span className="t">{hm(row.at)}</span></div>
        <div className="body">{typeof row.card === 'string' ? <div>{row.card}</div> : row.card instanceof Node ? <Mount node={row.card} /> : row.card}</div>
      </motion.div>
    );
  }
  if (row.kind === 'failure') return <motion.div data-mid={row.id} {...mo}><FailureCard m={m} /></motion.div>;
  if (row.kind === 'sys') return <motion.div className={'msg sys' + (m.muted ? ' muted' : '')} data-mid={row.id} {...mo}><Ico d="M5 12h14M13 6l6 6-6 6" /><span>{m.text}</span></motion.div>;
  if (row.kind === 'batch') return <motion.div className="msg review-context-row" data-mid={row.id} {...mo}><ReviewContext context={m.reviewBatch} inferred={row.inferred} profile={profile} /></motion.div>;
  if (row.kind === 'judge') return <motion.div className="msg judge-row" data-mid={row.id} {...mo}><Judge m={m} profile={profile} /></motion.div>;
  if (row.kind === 'auto') return <motion.div className="msg approval-row dim" data-mid={row.id} {...mo}><AutoBody m={m} profile={profile} isOpen={isOpen} live={row.live} /><Actions m={m} /></motion.div>;

  const cont = row.cont, r = m.replyTo, speaker = visibleSpeaker(m);
  const t = <span className="t" title={new Date(m.at).toLocaleString()}>{cont ? hm(m.at) : stamp(m.at)}</span>;
  const body = (
    <>
      <Html className="body" html={md(m.text || '', profile.name)} />
      {m.activity?.length ? <><ActList list={m.activity} />{m.activity.filter((a) => (a.kind === 'create' || a.kind === 'edit') && a.abs && ACT_IMG.test(a.abs)).slice(0, 4).map((a) => <Thumb key={a.abs} p={a.abs} />)}</> : null}
      {m.attachments?.length ? <div className="atts">{m.attachments.map((a, i) => <Att key={i} a={a} />)}</div> : null}
      <FileCards m={m} />
      {m.askUser && isOpen && <ChoiceBar opts={m.options?.length ? m.options : ['Approve', 'Reject']} info={m.optionInfo} cls={m.options?.length ? 'lettered' : ''} live={row.live} />}
      {m.askUser && <div className="wait">Choose an option or write your own answer</div>}
    </>
  );
  const ask = m.askUser ? { ask: true, style: { '--spk': nameColor(m.from) } } : {};
  const cls = (cont ? 'msg cont' : 'msg grp' + (r ? ' rp' : '')) + (ask.ask ? ' ask' : '');
  return (
    <motion.div className={cls} data-mid={row.id} style={ask.style} {...mo}>
      {cont ? <>{t}{body}</> : (
        <>
          {r && <div className="reply" onClick={() => jump(r)}><Avatar from={r.from} sm via={r.via} provider={messageProvider(r)} /><b style={{ color: nameColor(visibleSpeaker(r)) }}>{disp(visibleSpeaker(r), profile)}</b><span>{r.text.replace(/\s+/g, ' ')}</span></div>}
          <Avatar from={m.from} via={m.via} provider={messageProvider(m)} />
          <div className="hd">
            <b className={'nm' + (m.from === 'user' ? ' u' : '')} style={{ color: nameColor(speaker) }}>{disp(speaker, profile)}</b>
            <RtBadge model={m.route?.model || m.usage?.model} effort={m.route?.effort} />
            {m.lead && <span className="lt">lead</span>}{m.sub && <span className="lt">sub: {m.sub}</span>}{m.viaAuto && <span className="lt">via auto</span>}
            {t}
          </div>
          {body}
        </>
      )}
      <Actions m={m} />
    </motion.div>
  );
}
export default memo(Row, (a, b) => a.row.id === b.row.id && a.row.cont === b.row.cont && a.row.kind === b.row.kind && a.isOpen === b.isOpen && a.row.m === b.row.m);
