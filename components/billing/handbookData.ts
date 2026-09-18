// In-app reference handbooks, one per role (biller / owner / clinician / admin).
// All four share HANDBOOK_CSS, scoped under #bhb so it cannot collide with the
// app CSS or leak its theme variables. The /billing/guide page renders the one
// that matches the signed-in person via handbookHtmlFor(). Regenerate the
// matching HTML block if a role's screens change.
/* eslint-disable */
export const HANDBOOK_CSS = String.raw`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
#bhb{box-sizing:border-box}
#bhb {
  --ground:#f3f6f5; --surface:#ffffff; --surface-2:#eef3f2; --surface-3:#e7efed;
  --ink:#16211f; --ink-2:#33423f; --muted:#5b6b68; --faint:#849693;
  --accent:#1f6d70; --accent-ink:#124b4d; --accent-soft:#dcecea;
  --edge:#dde6e4; --edge-2:#cdd9d6;
  --good:#2f7d4f; --good-soft:#dcefe2;
  --warn:#a86612; --warn-soft:#f6e8cf;
  --bad:#bd3a29; --bad-soft:#f5ddd7;
  --info:#2f5ea8; --info-soft:#dde6f5;
  --shadow:0 1px 2px rgba(20,40,38,.05), 0 4px 16px rgba(20,40,38,.05);
}
:root:not([data-theme="light"]) #bhb {
  @media (prefers-color-scheme: dark){
    --ground:#0e1514; --surface:#151e1c; --surface-2:#1b2624; --surface-3:#21302d;
    --ink:#e7edeb; --ink-2:#c2cecb; --muted:#93a5a1; --faint:#6d7f7b;
    --accent:#54b7b3; --accent-ink:#8fd6d2; --accent-soft:#1d3634;
    --edge:#273533; --edge-2:#33443f;
    --good:#63c088; --good-soft:#183226; --warn:#e0a54e; --warn-soft:#33270f;
    --bad:#e8887a; --bad-soft:#341b17; --info:#7ba4e6; --info-soft:#16233c;
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.28);
  }
}
:root[data-theme="dark"] #bhb {
  --ground:#0e1514; --surface:#151e1c; --surface-2:#1b2624; --surface-3:#21302d;
  --ink:#e7edeb; --ink-2:#c2cecb; --muted:#93a5a1; --faint:#6d7f7b;
  --accent:#54b7b3; --accent-ink:#8fd6d2; --accent-soft:#1d3634;
  --edge:#273533; --edge-2:#33443f;
  --good:#63c088; --good-soft:#183226; --warn:#e0a54e; --warn-soft:#33270f;
  --bad:#e8887a; --bad-soft:#341b17; --info:#7ba4e6; --info-soft:#16233c;
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.28);
}
#bhb, #bhb * {box-sizing:border-box}
#bhb {
  background:var(--ground); color:var(--ink);
  font-family:"Public Sans", system-ui, sans-serif;
  font-size:15px; line-height:1.5; margin:0;
  -webkit-font-smoothing:antialiased;
}
#bhb .wrap {max-width:1180px; margin:0 auto; padding-inline:20px; padding-block:0;}
#bhb .layout {display:grid; grid-template-columns:232px 1fr; gap:38px; align-items:start;}
#bhb /* ---- masthead ---- */
.mast {padding:46px 0 26px; border-bottom:1px solid var(--edge);}
#bhb .mast .eyebrow {font-family:"IBM Plex Mono",monospace; font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--accent); margin:0 0 12px;}
#bhb .mast h1 {font-family:"Fraunces",serif; font-weight:600; font-size:clamp(2.1rem,5vw,3.05rem); line-height:1.04; margin:0; letter-spacing:-.01em; text-wrap:balance; color:var(--ink);}
#bhb .mast p.sub {margin:14px 0 0; font-size:16px; color:var(--muted); max-width:60ch;}
#bhb .mchips {display:flex; flex-wrap:wrap; gap:8px; margin-top:20px;}
#bhb .mchip {font-size:12.5px; font-weight:600; padding:4px 11px; border-radius:999px; background:var(--surface-2); color:var(--ink-2); border:1px solid var(--edge);}
#bhb .mchip b {color:var(--accent-ink);}
#bhb /* ---- table of contents ---- */
.toc {position:sticky; top:calc(env(safe-area-inset-top,0px) + 18px); font-size:13.5px;}
#bhb .toc .tl {font-family:"IBM Plex Mono",monospace; font-size:11px; letter-spacing:.13em; text-transform:uppercase; color:var(--faint); margin:0 0 10px 12px;}
#bhb .toc ol {list-style:none; margin:0; padding:0; counter-reset:toc;}
#bhb .toc a {display:flex; gap:9px; align-items:baseline; text-decoration:none; color:var(--ink-2); padding:6px 12px; border-radius:8px; border-left:2px solid transparent;}
#bhb .toc a:hover {background:var(--surface-2); color:var(--ink);}
#bhb .toc a .n {counter-increment:toc; font-family:"IBM Plex Mono",monospace; font-size:11px; color:var(--accent); min-width:16px;}
#bhb .toc a .n::before {content:counter(toc,decimal-leading-zero);}
#bhb .toc a.plain .n {visibility:hidden;}
#bhb /* ---- main flow ---- */
main {padding-bottom:80px; min-width:0;}
#bhb section.grp {padding-top:40px; scroll-margin-top:24px;}
#bhb section.grp > .gh {margin:0 0 4px; display:flex; align-items:center; gap:12px;}
#bhb section.grp > .gh h2 {font-family:"Fraunces",serif; font-weight:600; font-size:1.72rem; margin:0; letter-spacing:-.01em; color:var(--ink);}
#bhb section.grp > .gh .gn {font-family:"IBM Plex Mono",monospace; font-size:12px; color:var(--accent); border:1px solid var(--accent-soft); background:var(--accent-soft); color:var(--accent-ink); border-radius:6px; padding:2px 8px;}
#bhb section.grp > p.gintro {margin:2px 0 18px; color:var(--muted); max-width:66ch;}
#bhb /* ---- page card ---- */
.page {background:var(--surface); border:1px solid var(--edge); border-radius:14px; padding:20px 22px; margin-bottom:16px; box-shadow:var(--shadow);}
#bhb .page .ph {display:flex; flex-wrap:wrap; align-items:center; gap:10px 12px; margin-bottom:6px;}
#bhb .page .ph h3 {font-family:"Fraunces",serif; font-weight:600; font-size:1.24rem; margin:0; color:var(--ink); letter-spacing:-.005em;}
#bhb .route {font-family:"IBM Plex Mono",monospace; font-size:12px; color:var(--accent-ink); background:var(--surface-3); border:1px solid var(--edge); border-radius:6px; padding:2.5px 8px; word-break:break-all;}
#bhb .page .lede {margin:4px 0 14px; color:var(--ink-2); font-size:14.5px;}
#bhb .gate {font-family:"IBM Plex Mono",monospace; font-size:11px; font-weight:500; color:var(--muted); border:1px dashed var(--edge-2); border-radius:6px; padding:2px 7px; white-space:nowrap;}
#bhb .cols {display:grid; grid-template-columns:1fr 1fr; gap:14px 26px;}
#bhb .block h4 {font-size:11px; font-family:"IBM Plex Mono",monospace; letter-spacing:.1em; text-transform:uppercase; color:var(--accent); margin:0 0 7px;}
#bhb .block.full {grid-column:1/-1;}
#bhb ul.b {list-style:none; margin:0; padding:0;}
#bhb ul.b li {position:relative; padding-left:16px; margin-bottom:6px; font-size:14px; color:var(--ink-2);}
#bhb ul.b li::before {content:""; position:absolute; left:2px; top:8px; width:5px; height:5px; border-radius:50%; background:var(--edge-2);}
#bhb ul.b li b {color:var(--ink); font-weight:600;}
#bhb code.k {font-family:"IBM Plex Mono",monospace; font-size:12px; background:var(--surface-2); border:1px solid var(--edge); border-radius:5px; padding:1px 6px; color:var(--accent-ink); white-space:nowrap;}
#bhb .mini {font-size:12.5px; color:var(--muted);}
#bhb /* status pills */
.pill {display:inline-block; font-size:11.5px; font-weight:700; padding:1.5px 9px; border-radius:999px; line-height:1.5; white-space:nowrap;}
#bhb .pill.self {background:var(--accent-soft); color:var(--accent-ink);}
#bhb .pill.tobill {background:var(--warn-soft); color:var(--warn);}
#bhb .pill.await {background:var(--info-soft); color:var(--info);}
#bhb .pill.collected {background:var(--good-soft); color:var(--good);}
#bhb .pill.off {background:var(--surface-3); color:var(--muted); text-decoration:line-through;}
#bhb /* legend / callouts */
.legend {background:var(--surface); border:1px solid var(--edge); border-radius:14px; padding:18px 20px; margin-top:22px; box-shadow:var(--shadow);}
#bhb .legend h4 {margin:0 0 12px; font-family:"IBM Plex Mono",monospace; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--accent);}
#bhb .legrow {display:flex; flex-wrap:wrap; gap:18px 30px;}
#bhb .legcol {flex:1 1 240px; min-width:220px;}
#bhb .legcol .li {display:flex; gap:10px; align-items:baseline; margin-bottom:7px; font-size:13px; color:var(--ink-2);}
#bhb .legcol .li .lb {flex:0 0 auto;}
#bhb .tip {background:var(--accent-soft); border-radius:10px; padding:11px 14px; margin:14px 0 2px; font-size:13.5px; color:var(--accent-ink); border:1px solid transparent;}
#bhb .tip b {font-weight:700;}
#bhb .warnbox {background:var(--warn-soft); color:var(--warn); border-radius:10px; padding:11px 14px; margin:14px 0 2px; font-size:13.5px; font-weight:500;}
#bhb /* cycle flow */
.flow {display:flex; flex-wrap:wrap; gap:8px; align-items:stretch; margin:6px 0 20px;}
#bhb .step {flex:1 1 120px; background:var(--surface); border:1px solid var(--edge); border-radius:11px; padding:11px 13px; position:relative; box-shadow:var(--shadow);}
#bhb .step .sn {font-family:"IBM Plex Mono",monospace; font-size:11px; color:var(--accent);}
#bhb .step .st {font-family:"Fraunces",serif; font-weight:600; font-size:15px; margin:2px 0 3px; color:var(--ink);}
#bhb .step .sd {font-size:12px; color:var(--muted); line-height:1.35;}
#bhb /* definition list (record anatomy, #bhb glossary) */
.dl {border:1px solid var(--edge); border-radius:14px; overflow:hidden; background:var(--surface); box-shadow:var(--shadow);}
#bhb .dl .row {display:grid; grid-template-columns:200px 1fr; gap:0; border-top:1px solid var(--edge);}
#bhb .dl .row:first-child {border-top:none;}
#bhb .dl dt {padding:13px 16px; font-weight:600; color:var(--ink); background:var(--surface-2); font-size:14px; border-right:1px solid var(--edge);}
#bhb .dl dd {padding:13px 16px; margin:0; color:var(--ink-2); font-size:14px;}
#bhb .dl dd b {color:var(--ink);}
#bhb footer.foot {border-top:1px solid var(--edge); margin-top:40px; padding:24px 0 10px; color:var(--faint); font-size:12.5px;}
#bhb a.jump {color:var(--accent-ink); text-decoration:none; border-bottom:1px solid var(--accent-soft);}
#bhb a.jump:hover {border-color:var(--accent);}
@media (max-width:860px) {
#bhb .layout {grid-template-columns:1fr; gap:0;}
#bhb .toc {position:static; margin:18px 0 4px; border:1px solid var(--edge); border-radius:12px; background:var(--surface); padding:10px 6px;}
#bhb .toc details {padding:0 6px;}
#bhb .toc summary {cursor:pointer; font-family:"IBM Plex Mono",monospace; font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--accent); padding:6px;}
#bhb .cols {grid-template-columns:1fr;}
#bhb .dl .row {grid-template-columns:1fr;}
#bhb .dl dt {border-right:none; border-bottom:1px solid var(--edge);}
}
@media (min-width:861px) {
#bhb .toc details > summary {display:none;}
#bhb .toc details {display:block;}
}`;

export const HANDBOOK_HTML = String.raw`<div class="wrap">
  <header class="mast">
    <p class="eyebrow">TIFEC · Essential Care · Billing</p>
    <h1>The Biller's Handbook</h1>
    <p class="sub">Every screen you touch as the biller, grouped by the job it does. What the page is for, what each thing on it means, and what every button does.</p>
    <div class="mchips">
      <span class="mchip">Currency <b>KYD</b></span>
      <span class="mchip">Dates pinned to <b>Cayman time</b></span>
      <span class="mchip">Your role: <b>Biller</b></span>
      <span class="mchip">For a functionality review</span>
    </div>
  </header>

  <div class="layout">
    <nav class="toc">
      <details open>
        <summary>Contents</summary>
        <p class="tl">The workflows</p>
        <ol>
          <li><a class="plain" href="#start"><span class="n"></span>Start here</a></li>
          <li><a href="#cycle"><span class="n"></span>The billing cycle</a></li>
          <li><a href="#docs"><span class="n"></span>Claims &amp; invoices</a></li>
          <li><a href="#chase"><span class="n"></span>Chasing money</a></li>
          <li><a href="#clients"><span class="n"></span>Clients</a></li>
          <li><a href="#payouts"><span class="n"></span>Money &amp; payouts</a></li>
          <li><a href="#team"><span class="n"></span>Team &amp; tickets</a></li>
          <li><a href="#setup"><span class="n"></span>Setup &amp; worklist</a></li>
          <li><a class="plain" href="#glossary"><span class="n"></span>Money words</a></li>
        </ol>
      </details>
    </nav>

    <main>
      <!-- ============ START ============ -->
      <section class="grp" id="start">
        <div class="gh"><h2>Start here</h2></div>
        <p class="gintro">Three roles share the app. You are the <b>Biller</b>: you see the billing operation and the money owed, but not a clinician's private payout settings or their clinical notes.</p>

        <div class="page">
          <div class="ph"><h3>The three roles</h3></div>
          <div class="cols">
            <div class="block">
              <h4>Who sees what</h4>
              <ul class="b">
                <li><b>Biller</b> (you): billing queue, claims, invoices, money owed, every client, the by-clinician numbers, Setup (claims + fees only).</li>
                <li><b>Owner</b>: the whole business picture plus the money-management side of Setup (retention, expenses, splits).</li>
                <li><b>Clinician</b>: only their own clients, sessions and payout.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Your left menu</h4>
              <ul class="b">
                <li><code class="k">Biller dashboard</code> your month and commission</li>
                <li><code class="k">Billing queue</code> the daily workspace</li>
                <li><code class="k">By clinician</code> per-person numbers</li>
                <li><code class="k">Owed by clients</code> chase list</li>
                <li><code class="k">Clients</code> the roster</li>
                <li>Plus <b>Team</b> (Notices, Messages, Tickets) and <b>Setup</b> + <b>Worklist</b></li>
              </ul>
            </div>
          </div>
        </div>

        <div class="legend">
          <h4>How to read this guide</h4>
          <div class="legrow">
            <div class="legcol">
              <div class="li"><span class="lb"><code class="k">grey mono</code></span><span>= a real button or label exactly as it appears on screen.</span></div>
              <div class="li"><span class="lb"><span class="route">/billing/…</span></span><span>= the page's web address (what shows in the browser bar).</span></div>
              <div class="li"><span class="lb"><span class="gate">biller / owner only</span></span><span>= who is allowed on that page or control.</span></div>
            </div>
            <div class="legcol">
              <div class="li"><span class="lb"><span class="pill self">Self-pay</span></span><span>client pays the full fee, goes on an invoice.</span></div>
              <div class="li"><span class="lb"><span class="pill tobill">To bill</span></span><span>insured, not yet sent to the insurer.</span></div>
              <div class="li"><span class="lb"><span class="pill await">Awaiting payment</span></span><span>claim submitted, waiting on the insurer.</span></div>
              <div class="li"><span class="lb"><span class="pill collected">Collected</span></span><span>insurer paid, cash is in. This pays out.</span></div>
              <div class="li"><span class="lb"><span class="pill off">Write-off</span></span><span>settled without full payment, never counts as collected.</span></div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ CYCLE ============ -->
      <section class="grp" id="cycle">
        <div class="gh"><h2>The billing cycle</h2><span class="gn">your day-to-day</span></div>
        <p class="gintro">The heart of your job. A claim moves left to right as you work it. The <b>Billing queue</b> has one tab per stage.</p>

        <div class="flow">
          <div class="step"><div class="sn">01</div><div class="st">Session logged</div><div class="sd">A clinician records the visit.</div></div>
          <div class="step"><div class="sn">02</div><div class="st">To bill</div><div class="sd">Build the CMS-1500, mark it submitted.</div></div>
          <div class="step"><div class="sn">03</div><div class="st">Awaiting</div><div class="sd">Waiting on the insurer to pay.</div></div>
          <div class="step"><div class="sn">04</div><div class="st">Collected</div><div class="sd">Money lands, you mark it collected.</div></div>
          <div class="step"><div class="sn">05</div><div class="st">Payout</div><div class="sd">Only collected cash pays anyone.</div></div>
        </div>

        <div class="page">
          <div class="ph"><h3>Billing queue</h3><span class="route">/billing/payments</span><span class="gate">biller / owner</span></div>
          <p class="lede">Your operational workspace: submit claims to insurers, then mark them collected as money lands.</p>
          <div class="cols">
            <div class="block">
              <h4>The tabs (a claim's life)</h4>
              <ul class="b">
                <li><span class="pill tobill">To bill</span> logged, not yet submitted. Sorted oldest first.</li>
                <li><span class="pill await">Awaiting payment</span> submitted, waiting on the insurer.</li>
                <li><span class="pill collected">Collected</span> paid in full. Scoped one month at a time.</li>
                <li><span class="pill self">Self-pay</span> client balances (shows only if any exist).</li>
                <li><span class="pill off">Written off / down</span> settled by adjustment, never pays out.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Top ribbon (at a glance)</h4>
              <ul class="b">
                <li><b>To bill</b> count, <b>Awaiting payment</b> total, <b>Collected this month</b>.</li>
                <li><b>Oldest open</b> in days (turns amber at 15+).</li>
                <li><b>Your cut so far</b> and <b>+pending on open</b>.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Working the rows</h4>
              <ul class="b">
                <li>Group <b>by insurer</b> or <b>by clinician</b>; search and filter by clinician.</li>
                <li>Aging chips: <code class="k">0-14</code> <code class="k">15-30</code> <code class="k">31-60</code> <code class="k">60+ days</code>.</li>
                <li>On <b>To bill</b> rows: a short <code class="k">+ note</code> (max 40 chars) the clinician can also see.</li>
                <li><b>Awaiting</b> rows carry an editable <b>billed date</b>, back-date it to when the claim really went out.</li>
                <li>A <b>⚠ after referral</b> flag warns a visit falls after the client's referral ended.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Buttons</h4>
              <ul class="b">
                <li><code class="k">Mark N billed</code> stamps the submitted date on ticked To-bill claims.</li>
                <li><code class="k">Mark N collected</code> records payment on Awaiting / Self-pay rows.</li>
                <li><code class="k">Generate CMS-1500</code> builds claim forms for ticked sessions.</li>
                <li><code class="k">Un-bill</code> sends a claim back to To bill.</li>
                <li><code class="k">Write off/down</code> then <code class="k">Settle</code> records a partial or nil payment.</li>
                <li><code class="k">Undo</code> reverses a collected or written-off claim.</li>
              </ul>
            </div>
          </div>
          <div class="tip"><b>Only collected money pays out.</b> Submitting a claim or writing one off never adds to anyone's payout. Cash landing (marked collected) is the only thing that does.</div>
        </div>
      </section>

      <!-- ============ DOCS ============ -->
      <section class="grp" id="docs">
        <div class="gh"><h2>Claims &amp; invoices</h2><span class="gn">the paperwork</span></div>
        <p class="gintro">Two documents leave the practice: the <b>CMS-1500</b> goes to the insurer, the <b>invoice</b> goes to the client. Insured visits go on a claim, self-pay visits go on an invoice.</p>

        <div class="page">
          <div class="ph"><h3>CMS-1500 claim</h3><span class="route">/billing/clients/[id]/cms1500</span><span class="route">/billing/clients/batch</span></div>
          <p class="lede">A print-ready health-insurance claim form built from a client's insured sessions. Print or Save-as-PDF, then submit to the insurer.</p>
          <div class="cols">
            <div class="block">
              <h4>How sessions become lines</h4>
              <ul class="b">
                <li><b>One form per insurer</b>. Sessions are grouped by payer.</li>
                <li>Each CPT code occurrence is its own service line in box 24.</li>
                <li>Box 24 holds <b>6 lines</b>; more than 6 spills onto a continuation form (<span class="mini">"form 2 of 3"</span>).</li>
                <li>Self-pay visits never appear here.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Two views &amp; where fields come from</h4>
              <ul class="b">
                <li><code class="k">Official form</code> (the red facsimile) and <code class="k">Review sheet</code> (plain, easy to scan). Only the visible one prints.</li>
                <li>Patient / insured / diagnosis (box 21) come from the <b>client record</b>.</li>
                <li>NPI, Tax ID, billing provider (boxes 25, 31-33) come from <b>Setup</b>. If unset, they print blank with a warning.</li>
              </ul>
            </div>
          </div>
          <div class="cols" style="margin-top:8px">
            <div class="block full">
              <h4>Getting there</h4>
              <ul class="b">
                <li>From a client record: <code class="k">Generate CMS-1500</code> (all their insured visits), or tick rows and use <code class="k">CMS-1500 (N)</code>.</li>
                <li>From the roster or queue: tick several and batch them. The button reads <code class="k">Print N claim / Save PDF</code>, where N is the total number of forms across everyone.</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Client invoice</h3><span class="route">/billing/clients/[id]/invoice</span></div>
          <p class="lede">A bill sent to the client for what they personally owe. Two kinds, chosen automatically by the visit type.</p>
          <div class="cols">
            <div class="block">
              <h4>Two kinds</h4>
              <ul class="b">
                <li><b>Self-pay</b>: the full fee for visits with no insurer.</li>
                <li><b>Co-pay</b> (<code class="k">type=copay</code>): just the outstanding co-pay on an insured visit, each line prefixed "Co-pay:".</li>
                <li>A <code class="k">sessions=</code> list narrows it to exactly the visits you ticked; with none, it covers all that qualify.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Email to client</h4>
              <ul class="b">
                <li><code class="k">Email to client</code> opens a preview: To, editable <b>Subject</b>, the attached PDF, <b>Replies to</b> the treating clinician, and an editable message.</li>
                <li><code class="k">Send to client</code> sends it; the send is logged on the client's record under <b>Emails sent</b>.</li>
                <li>No email on file blocks the send and tells you to add one first.</li>
              </ul>
            </div>
          </div>
          <div class="warnbox">Known gap you flagged: when you tick a <b>mix</b> of self-pay and insured charges, the <code class="k">Invoice (N)</code> button only carries the self-pay ones. A fix to bill a mixed selection on one invoice is queued.</div>
        </div>
      </section>

      <!-- ============ CHASE ============ -->
      <section class="grp" id="chase">
        <div class="gh"><h2>Chasing money</h2><span class="gn">what's still owed</span></div>
        <p class="gintro">Three lists of outstanding money: what clients owe, co-pays not yet collected, and insurance claims that are getting old.</p>

        <div class="page">
          <div class="ph"><h3>Owed by clients</h3><span class="route">/billing/balances</span><span class="gate">biller / owner</span></div>
          <p class="lede">Everything clients still owe, oldest first, so you know who to chase.</p>
          <div class="cols">
            <div class="block">
              <h4>Top cards</h4>
              <ul class="b">
                <li><b>Total owed</b> = self-pay balances + uncollected co-pays.</li>
                <li><b>Self-pay balances</b> and <b>Co-pays not collected</b> (jumps to the co-pays page).</li>
              </ul>
            </div>
            <div class="block">
              <h4>The list</h4>
              <ul class="b">
                <li>Per client: self-pay owed, co-pay not collected, total, and <b>Oldest</b> visit date.</li>
                <li>Sorted oldest first, chase the top of the list.</li>
                <li><code class="k">Invoice →</code> for a self-pay balance, <code class="k">Open →</code> for a co-pay-only client.</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Outstanding co-pays</h3><span class="route">/billing/copays</span></div>
          <p class="lede">Every insured visit where a co-pay was due but hasn't come in. Record it when it arrives.</p>
          <div class="cols">
            <div class="block">
              <h4>Controls</h4>
              <ul class="b">
                <li><b>Received on</b> date sets the day a collected co-pay books to (defaults today).</li>
                <li>Search by client; toggle <b>My clients</b> / <b>Everyone</b>.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Actions</h4>
              <ul class="b">
                <li><code class="k">Collect</code> records the co-pay as received. This is how you mark a co-pay paid.</li>
                <li><code class="k">Invoice</code> bills it instead.</li>
                <li>Tick several for the <b>same client</b>, then <code class="k">Create one invoice</code>.</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Aged insurance claims</h3><span class="route">/billing/aged-claims</span><span class="gate">biller / owner</span></div>
          <p class="lede">Unpaid claims grouped by insurer, oldest first. Print a report to take into an insurer meeting.</p>
          <div class="cols">
            <div class="block">
              <h4>The index</h4>
              <ul class="b">
                <li>Cards: <b>Total outstanding</b> and <b>60+ days</b> (the threshold that matters).</li>
                <li>One card per insurer, most 60+-day money first. Click through for their report.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Per-insurer report</h4>
              <ul class="b">
                <li>Age filter tabs <code class="k">All</code> <code class="k">60+</code> <code class="k">90+</code> <code class="k">120+</code>, plus <code class="k">Print / Save PDF</code>.</li>
                <li>Aging bands (0-14 / 15-30 / 31-60 / 60+) then a claim table with <b>Days out</b>; 60+ rows highlighted.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ CLIENTS ============ -->
      <section class="grp" id="clients">
        <div class="gh"><h2>Clients</h2><span class="gn">records</span></div>
        <p class="gintro">The roster is the master list; each client record holds everything a claim or invoice needs.</p>

        <div class="page">
          <div class="ph"><h3>Client roster</h3><span class="route">/billing/clients</span></div>
          <p class="lede">Every client in the practice. Open one, or tick several and build their claims in one run.</p>
          <div class="cols">
            <div class="block">
              <h4>Columns</h4>
              <ul class="b">
                <li>Client, Date of birth (+ age), Usual insurer (or <span class="pill self">Self-pay</span>), Seen by, <b>Paid</b> (cash collected), Last visit.</li>
                <li>Tap any heading to sort; a checkbox is disabled when a client has no insured sessions to claim.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Actions</h4>
              <ul class="b">
                <li>Search, filter by insurer or clinician.</li>
                <li><code class="k">+ New client</code> adds a client to a clinician's book.</li>
                <li>Tick several then <code class="k">Generate CMS-1500</code> to batch their claims.</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Client record</h3><span class="route">/billing/clients/[id]</span></div>
          <p class="lede">One client's full file. Sections top to bottom:</p>
          <div class="dl">
            <div class="row"><dt>Referral banner</dt><dd>Always visible, payment-critical. Shows days left / expiring / expired. Visits after the end date <b>can't be billed</b>. <code class="k">Add / Renew referral</code>.</dd></div>
            <div class="row"><dt>Client record</dt><dd>Identity + insurance: DOB, sex, contact, address, insurer, member ID, relationship to insured. <code class="k">Edit details</code> to change; a referral sub-block sets the billing window.</dd></div>
            <div class="row"><dt>Insurance deductible</dt><dd>The insurer's annual figure counting down as the client pays out of pocket. Not money you hold. <span class="gate">biller / owner / admin edit</span></dd></div>
            <div class="row"><dt>Diagnoses</dt><dd>ICD-10 codes for box 21 of the claim. Anyone on the record can edit; changes are logged.</dd></div>
            <div class="row"><dt>Documents</dt><dd>Intake form (auto-linked), referral letter, anything else. Upload a file (up to 4 MB) or add a link.</dd></div>
            <div class="row"><dt>Team notes</dt><dd>Admin / billing notes the whole team sees (benefits, authorisations, insurer calls). <b>Not for clinical or sensitive info.</b></dd></div>
            <div class="row"><dt>Appointments &amp; charges</dt><dd>Every date of service with its status pill. Tick insured visits for a claim, self-pay for an invoice. Per row: <b>⚠ after referral</b> and <b>⚑ Read note</b> flags, plus an inline <code class="k">Invoice</code> link when that visit is owed. <code class="k">Change selected…</code> bulk-edits ticked rows.</dd></div>
            <div class="row"><dt>Emails sent</dt><dd>Every invoice the system emailed this client, with sent / failed status.</dd></div>
            <div class="row"><dt>Session notes</dt><dd>Clinical, encrypted, treating clinicians only. A pure biller never sees these.</dd></div>
          </div>
          <div class="tip">The status pill on each charge is the single source of truth for where that visit sits: <span class="pill self">Self-pay</span> <span class="pill tobill">To bill</span> <span class="pill await">Awaiting payment</span> <span class="pill collected">Collected</span> <span class="pill off">Write-off</span>.</div>
        </div>
      </section>

      <!-- ============ PAYOUTS ============ -->
      <section class="grp" id="payouts">
        <div class="gh"><h2>Money &amp; payouts</h2><span class="gn">the numbers</span></div>
        <p class="gintro">Your own earnings, and each clinician's month. Every figure comes from the rates set in Setup, so the dashboard and the printed statements always agree.</p>

        <div class="page">
          <div class="ph"><h3>Biller dashboard</h3><span class="route">/billing/biller</span></div>
          <p class="lede">Your month: commission earned, what's still owed to you, and where your cut came from.</p>
          <div class="cols">
            <div class="block">
              <h4>On the page</h4>
              <ul class="b">
                <li><b>Your commission</b> for the month (this equals your payout), with a 6-month trend.</li>
                <li><b>Who owes you</b>: insurers with outstanding claims, oldest first, and your cut on each.</li>
                <li><b>Where your cut came from</b>: per-clinician breakdown plus the company retention row.</li>
                <li><b>Recently collected</b>: the last 8 paid claims.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Buttons</h4>
              <ul class="b">
                <li><code class="k">Payout statement →</code> the printable version.</li>
                <li><code class="k">Open billing queue →</code> to reconcile.</li>
                <li>Month navigator to step back through months.</li>
              </ul>
            </div>
          </div>
          <div class="mini" style="margin-top:8px">Your <b>net payout</b> on the statement = commission earned minus your own pension.</div>
        </div>

        <div class="page">
          <div class="ph"><h3>By clinician</h3><span class="route">/billing/clinicians</span><span class="route">/billing/clinician/[id]</span></div>
          <p class="lede">The practice snapshot, one row per clinician, and a full month view for any one of them.</p>
          <div class="cols">
            <div class="block">
              <h4>Directory</h4>
              <ul class="b">
                <li>Per clinician: collected vs outstanding this month, and their payout.</li>
                <li>You can open any clinician to reconcile their numbers.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Clinician detail</h4>
              <ul class="b">
                <li>KPI tiles (earned, collected at visit, insurance collected vs outstanding, co-pays, write-offs).</li>
                <li>A payout breakdown, this month's work, and the session list.</li>
                <li>Printable <code class="k">Collections report</code> and <code class="k">payout statement</code>.</li>
                <li><span class="mini">Note: you can mark billed / collected in the queue, but session edit &amp; delete here are owner / self only.</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ TEAM ============ -->
      <section class="grp" id="team">
        <div class="gh"><h2>Team &amp; tickets</h2><span class="gn">collaboration</span></div>
        <p class="gintro">Chat for quick things, tickets for anything that needs tracking. Keep client names out of both. Attachments up to 4 MB.</p>

        <div class="page">
          <div class="ph"><h3>Notice board</h3><span class="route">/team/notices</span></div>
          <p class="lede">Practice-wide announcements. As a contact you can post; anyone can read and acknowledge.</p>
          <div class="cols">
            <div class="block"><h4>On the page</h4><ul class="b"><li>Pinned notices float to top; meeting notices show a live countdown.</li><li>Filter tabs: All, Needs your nod, Meetings.</li></ul></div>
            <div class="block"><h4>Buttons</h4><ul class="b"><li><code class="k">Post a notice</code> with optional meeting time, pin, and ask-to-acknowledge.</li><li>Acknowledge with <code class="k">I'll be there</code> or <code class="k">Got it</code>.</li></ul></div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Messages</h3><span class="route">/team/messages</span></div>
          <p class="lede">Direct chats, custom groups, and the whole-team channel. Text, images, files, voice notes.</p>
          <div class="cols">
            <div class="block"><h4>On the page</h4><ul class="b"><li><b>Everyone</b> channel, your groups, DMs, and teammates you haven't messaged.</li><li>Green dot = online in the last 3 minutes.</li></ul></div>
            <div class="block"><h4>Good to know</h4><ul class="b"><li>Enter sends, Shift+Enter is a new line.</li><li>Not a clinical record: use initials, not client names. Need it tracked? Raise a ticket.</li></ul></div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Tickets</h3><span class="route">/team/tickets</span></div>
          <p class="lede">The tracked, accountable channel for anything needing follow-through (payouts, HR, IT, billing issues).</p>
          <div class="cols">
            <div class="block">
              <h4>Status lifecycle</h4>
              <ul class="b">
                <li><b>Not started</b> → <code class="k">Start</code></li>
                <li><b>Being sorted</b> → <code class="k">Mark done</code> / <code class="k">Need info</code></li>
                <li><b>Needs info</b> / <b>On hold</b> → <code class="k">Resume</code></li>
                <li><b>Done</b> → <code class="k">Reopen</code></li>
              </ul>
            </div>
            <div class="block">
              <h4>How it works</h4>
              <ul class="b">
                <li>The "ball" sits with everyone who hasn't replied since the last comment. Yours shows <b>Your turn</b>; otherwise <b>Waiting on…</b> with a <code class="k">Nudge</code>.</li>
                <li>Edit your own posts within 10 minutes (or until someone replies).</li>
                <li>The person who raised it can <code class="k">Mark done</code> too. A done ticket is <b>closed to comments</b> until reopened.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ SETUP ============ -->
      <section class="grp" id="setup">
        <div class="gh"><h2>Setup &amp; worklist</h2><span class="gn">configuration</span></div>
        <p class="gintro">The rules behind every claim, invoice and payout, and the shared list of what to build next.</p>

        <div class="page">
          <div class="ph"><h3>Setup</h3><span class="route">/billing/config</span><span class="gate">biller / owner</span></div>
          <p class="lede">What you see is scoped: as biller you set the claims, fees and practice details, not the owner's money-management sections.</p>
          <div class="cols">
            <div class="block">
              <h4>Your sections</h4>
              <ul class="b">
                <li><b>My rates</b>: your commission % per clinician.</li>
                <li><b>Practice details</b>: name, address, contact, and the claim identifiers (Billing NPI box 33a, Tax ID box 25, taxonomy, rendering NPI per clinician box 24J). These print on claims and invoices.</li>
                <li><b>Insurers &amp; co-pay</b>: each insurer's co-pay rule and payer claim code.</li>
                <li><b>Service codes</b>: CPT codes with time / fee options (first is the default).</li>
              </ul>
            </div>
            <div class="block">
              <h4>Owner-only sections</h4>
              <ul class="b">
                <li>Biller commission %, running expenses, and per-clinician splits (retention, pension, biller base).</li>
                <li>You won't see these; they feed the payout math behind the scenes.</li>
              </ul>
            </div>
          </div>
          <div class="tip"><b>Every number traces back here.</b> If a payout or claim looks wrong, the cause is almost always a rate or identifier on this page.</div>
        </div>

        <div class="page">
          <div class="ph"><h3>Worklist</h3><span class="route">/billing/worklist</span></div>
          <p class="lede">The shared list of features and fixes you and the team want built.</p>
          <div class="cols">
            <div class="block"><h4>A feature has</h4><ul class="b"><li>Name, what it does, a flow (start → end), priority, status, attachments, and a notes thread.</li></ul></div>
            <div class="block"><h4>Buttons</h4><ul class="b"><li><code class="k">+ Add a feature</code>, then <code class="k">Mark done</code> / <code class="k">Start</code> / <code class="k">Reopen</code> and <code class="k">Ask / reply</code>.</li></ul></div>
          </div>
        </div>
      </section>

      <!-- ============ GLOSSARY ============ -->
      <section class="grp" id="glossary">
        <div class="gh"><h2>Money words</h2></div>
        <p class="gintro">The terms behind the figures. All amounts are KYD.</p>
        <div class="dl">
          <div class="row"><dt>Collected</dt><dd>Cash actually received: co-pays taken at the visit + insurance payments in. <b>Only collected money pays anyone.</b></dd></div>
          <div class="row"><dt>Insurance portion</dt><dd>The fee minus the contracted co-pay. An uncollected co-pay is the practice's loss, not extra insurance revenue.</dd></div>
          <div class="row"><dt>Outstanding</dt><dd>Insurance not yet collected, either to bill or awaiting payment.</dd></div>
          <div class="row"><dt>Retention</dt><dd>The company's cut of collected money (set per clinician). What's left after it is the clinician's share.</dd></div>
          <div class="row"><dt>Write-off vs write-down</dt><dd>A claim settled for less than billed. Both are a <b>separate bucket</b>, reported on their own, never counted as collected and never paid out.</dd></div>
          <div class="row"><dt>Your commission</dt><dd>Your cut per claim: each clinician's own rate on their insurance, plus a share of the company's retention where it applies. Charged on the after-retention share, not the gross.</dd></div>
          <div class="row"><dt>Net payout</dt><dd>Commission earned minus the earner's own pension.</dd></div>
          <div class="row"><dt>Aging buckets</dt><dd>How old an unpaid claim is by date of service: 0-14, 15-30, 31-60, and 60+ days (the one that matters).</dd></div>
        </div>
      </section>

      <footer class="foot">
        TIFEC Biller Handbook · generated for a functionality review · reflects the app as built on the feature/billing branch. If a screen differs from this guide, the app is the source of truth, flag it and it'll be updated.
      </footer>
    </main>
  </div>
</div>`;

// ===========================================================================
//  OWNER HANDBOOK
// ===========================================================================
export const OWNER_HANDBOOK_HTML = String.raw`<div class="wrap">
  <header class="mast">
    <p class="eyebrow">TIFEC · Essential Care · Billing</p>
    <h1>The Owner's Handbook</h1>
    <p class="sub">Every screen you touch as the practice owner, grouped by the job it does. The whole business, every clinician's numbers, and the money rules only you can set.</p>
    <div class="mchips">
      <span class="mchip">Currency <b>KYD</b></span>
      <span class="mchip">Dates pinned to <b>Cayman time</b></span>
      <span class="mchip">Your role: <b>Owner</b></span>
      <span class="mchip">For a functionality review</span>
    </div>
  </header>

  <div class="layout">
    <nav class="toc">
      <details open>
        <summary>Contents</summary>
        <p class="tl">The workflows</p>
        <ol>
          <li><a class="plain" href="#start"><span class="n"></span>Start here</a></li>
          <li><a href="#overview"><span class="n"></span>The business at a glance</a></li>
          <li><a href="#people"><span class="n"></span>People &amp; payouts</a></li>
          <li><a href="#cycle"><span class="n"></span>The billing cycle</a></li>
          <li><a href="#chase"><span class="n"></span>Chasing money</a></li>
          <li><a href="#clients"><span class="n"></span>Clients</a></li>
          <li><a href="#intake"><span class="n"></span>Intake &amp; your day</a></li>
          <li><a href="#team"><span class="n"></span>Team &amp; tickets</a></li>
          <li><a href="#setup"><span class="n"></span>Setup, the money rules</a></li>
          <li><a class="plain" href="#glossary"><span class="n"></span>Money words</a></li>
        </ol>
      </details>
    </nav>

    <main>
      <!-- ============ START ============ -->
      <section class="grp" id="start">
        <div class="gh"><h2>Start here</h2></div>
        <p class="gintro">Three roles share the app. You are the <b>Owner</b>: you see the whole practice and every clinician's numbers, you carry your own caseload too, and you alone set the money rules (retention, splits, expenses, biller commission).</p>

        <div class="page">
          <div class="ph"><h3>The three roles</h3></div>
          <div class="cols">
            <div class="block">
              <h4>Who sees what</h4>
              <ul class="b">
                <li><b>Owner</b> (you): the business overview, every clinician, all clients, and the full money side of Setup.</li>
                <li><b>Biller</b>: the billing operation and money owed, plus the claims-and-fees half of Setup, but not your money-management rules.</li>
                <li><b>Clinician</b>: only their own clients, sessions and payout.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Your left menu</h4>
              <ul class="b">
                <li><code class="k">Overview</code> the whole practice this month</li>
                <li><code class="k">By clinician</code> per-person numbers and payouts</li>
                <li><code class="k">Billing queue</code> claims workspace</li>
                <li><code class="k">Owed by clients</code> chase list</li>
                <li><code class="k">Clients</code> the full roster</li>
                <li><code class="k">Handbook</code> this guide</li>
                <li>Plus <b>Intake</b>, <b>Team</b>, and <b>Setup</b> + <b>Worklist</b></li>
              </ul>
            </div>
          </div>
        </div>

        <div class="legend">
          <h4>How to read this guide</h4>
          <div class="legrow">
            <div class="legcol">
              <div class="li"><span class="lb"><code class="k">grey mono</code></span><span>= a real button or label exactly as it appears on screen.</span></div>
              <div class="li"><span class="lb"><span class="route">/billing/…</span></span><span>= the page's web address (what shows in the browser bar).</span></div>
              <div class="li"><span class="lb"><span class="gate">owner only</span></span><span>= who is allowed on that page or control.</span></div>
            </div>
            <div class="legcol">
              <div class="li"><span class="lb"><span class="pill self">Self-pay</span></span><span>client pays the full fee, goes on an invoice.</span></div>
              <div class="li"><span class="lb"><span class="pill tobill">To bill</span></span><span>insured, not yet sent to the insurer.</span></div>
              <div class="li"><span class="lb"><span class="pill await">Awaiting payment</span></span><span>claim submitted, waiting on the insurer.</span></div>
              <div class="li"><span class="lb"><span class="pill collected">Collected</span></span><span>insurer paid, cash is in. This pays out.</span></div>
              <div class="li"><span class="lb"><span class="pill off">Write-off</span></span><span>settled without full payment, never counts as collected.</span></div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ OVERVIEW ============ -->
      <section class="grp" id="overview">
        <div class="gh"><h2>The business at a glance</h2><span class="gn">your home page</span></div>
        <p class="gintro">The one screen that answers "how did the practice do this month". Everything on it is scoped to a single month, which you step through with the month navigator.</p>

        <div class="page">
          <div class="ph"><h3>Business overview</h3><span class="route">/billing/overview</span><span class="gate">owner only</span></div>
          <p class="lede">The whole practice for one month. Billers and clinicians land on their own payout instead.</p>
          <div class="cols">
            <div class="block">
              <h4>The hero numbers</h4>
              <ul class="b">
                <li><b>Work earned</b>, <b>Collected</b>, <b>Still owed</b>, <b>Cash collected</b>.</li>
                <li>A <b>vs prior month</b> delta chip appears once there is a previous month to compare.</li>
              </ul>
            </div>
            <div class="block">
              <h4>The bottom line</h4>
              <ul class="b">
                <li>A waterfall: cash collected, minus clinician payouts, minus biller commission, minus running expenses, ending in <b>Net this month</b>.</li>
                <li>Biller commission splits into what was withheld from clinicians and the practice's own agreement.</li>
                <li>A footer projects the net once the outstanding insurer money lands.</li>
              </ul>
            </div>
            <div class="block">
              <h4>By clinician</h4>
              <ul class="b">
                <li>Sort tabs <code class="k">Collected</code> <code class="k">Outstanding</code> <code class="k">Payout</code>.</li>
                <li>Each row shows appointments, a collected-vs-outstanding bar, and the payout. Click a row to open that clinician's month.</li>
              </ul>
            </div>
            <div class="block">
              <h4>The side cards</h4>
              <ul class="b">
                <li><b>Cash collected, last 6 months</b> trend line.</li>
                <li><b>Running expenses</b> for the month, itemised.</li>
                <li><b>Waiting on insurance</b> per insurer, with a <code class="k">Print report</code> link into aged claims.</li>
                <li>A co-pays and write-offs panel when there is anything to show.</li>
              </ul>
            </div>
          </div>
          <div class="cols" style="margin-top:8px">
            <div class="block full">
              <h4>Buttons</h4>
              <ul class="b">
                <li><code class="k">Log a session</code>, <code class="k">Export month</code> (a printable month summary, <code class="k">Print / Save PDF</code>), <code class="k">Payout statements</code> (jumps to the by-clinician list), and the month navigator.</li>
              </ul>
            </div>
          </div>
          <div class="mini" style="margin-top:8px">A <b>platform processing fee</b> line shows only if one is set in Setup, and it is illustrative: it is never actually deducted from your net.</div>
        </div>
      </section>

      <!-- ============ PEOPLE ============ -->
      <section class="grp" id="people">
        <div class="gh"><h2>People &amp; payouts</h2><span class="gn">per clinician</span></div>
        <p class="gintro">The directory of everyone who bills, and a full month view for any one of them. Every figure is computed from the rates in Setup, so the screen and the printed statement always agree.</p>

        <div class="page">
          <div class="ph"><h3>By clinician</h3><span class="route">/billing/clinicians</span><span class="route">/billing/clinician/[id]</span></div>
          <p class="lede">One row per clinician, and a complete payout view when you open one.</p>
          <div class="cols">
            <div class="block">
              <h4>Directory</h4>
              <ul class="b">
                <li>Per clinician: collected vs outstanding this month and their payout.</li>
                <li>Open any clinician to reconcile their numbers.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Clinician detail</h4>
              <ul class="b">
                <li>KPI tiles (earned, collected at visit, insurance collected vs outstanding, co-pays, write-offs).</li>
                <li>A payout breakdown: collected, then retention, biller, other, health and pension, ending in <b>net payout</b>.</li>
                <li>This month's work, the session list, and printable <code class="k">Collections report</code> and <code class="k">payout statement</code>.</li>
                <li>As owner you can <b>edit and delete sessions</b> here, not just view them.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ CYCLE ============ -->
      <section class="grp" id="cycle">
        <div class="gh"><h2>The billing cycle</h2><span class="gn">the queue</span></div>
        <p class="gintro">Usually the biller's day-to-day, but you have the same access. A claim moves left to right as it is worked. The <b>Billing queue</b> has one tab per stage.</p>

        <div class="flow">
          <div class="step"><div class="sn">01</div><div class="st">Session logged</div><div class="sd">A clinician records the visit.</div></div>
          <div class="step"><div class="sn">02</div><div class="st">To bill</div><div class="sd">Build the CMS-1500, mark it submitted.</div></div>
          <div class="step"><div class="sn">03</div><div class="st">Awaiting</div><div class="sd">Waiting on the insurer to pay.</div></div>
          <div class="step"><div class="sn">04</div><div class="st">Collected</div><div class="sd">Money lands, mark it collected.</div></div>
          <div class="step"><div class="sn">05</div><div class="st">Payout</div><div class="sd">Only collected cash pays anyone.</div></div>
        </div>

        <div class="page">
          <div class="ph"><h3>Billing queue</h3><span class="route">/billing/payments</span><span class="gate">biller / owner</span></div>
          <p class="lede">The operational workspace: submit claims to insurers, then mark them collected as money lands.</p>
          <div class="cols">
            <div class="block">
              <h4>The tabs (a claim's life)</h4>
              <ul class="b">
                <li><span class="pill tobill">To bill</span> logged, not yet submitted.</li>
                <li><span class="pill await">Awaiting payment</span> submitted, waiting on the insurer.</li>
                <li><span class="pill collected">Collected</span> paid in full, scoped one month at a time.</li>
                <li><span class="pill self">Self-pay</span> client balances.</li>
                <li><span class="pill off">Written off / down</span> settled by adjustment, never pays out.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Buttons</h4>
              <ul class="b">
                <li><code class="k">Mark N billed</code>, <code class="k">Mark N collected</code>, <code class="k">Generate CMS-1500</code>.</li>
                <li><code class="k">Un-bill</code>, <code class="k">Write off/down</code> then <code class="k">Settle</code>, and <code class="k">Undo</code>.</li>
              </ul>
            </div>
          </div>
          <div class="tip"><b>Only collected money pays out.</b> Submitting a claim or writing one off never adds to anyone's payout. Cash landing (marked collected) is the only thing that does.</div>
        </div>
      </section>

      <!-- ============ CHASE ============ -->
      <section class="grp" id="chase">
        <div class="gh"><h2>Chasing money</h2><span class="gn">what's still owed</span></div>
        <p class="gintro">What clients owe, co-pays not yet collected, and insurance claims getting old. <b>Owed by clients</b> is on your menu; the other two are reached from the overview's cards.</p>

        <div class="page">
          <div class="ph"><h3>Owed by clients</h3><span class="route">/billing/balances</span><span class="gate">biller / owner</span></div>
          <p class="lede">Everything clients still owe, oldest first, so you know who to chase.</p>
          <div class="cols">
            <div class="block"><h4>Top cards</h4><ul class="b"><li><b>Total owed</b> = self-pay balances + uncollected co-pays.</li><li><b>Self-pay balances</b> and <b>Co-pays not collected</b>.</li></ul></div>
            <div class="block"><h4>The list</h4><ul class="b"><li>Per client: self-pay owed, co-pay not collected, total, oldest visit date.</li><li><code class="k">Invoice</code> a self-pay balance or <code class="k">Open</code> a co-pay-only client.</li></ul></div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Outstanding co-pays</h3><span class="route">/billing/copays</span></div>
          <p class="lede">Every insured visit where a co-pay was due but hasn't come in. Defaults to your own clients; toggle to <b>Everyone</b> to see the whole practice.</p>
          <div class="cols">
            <div class="block"><h4>Controls</h4><ul class="b"><li><b>Received on</b> date, search by client, and the <b>My clients / Everyone</b> toggle.</li></ul></div>
            <div class="block"><h4>Actions</h4><ul class="b"><li><code class="k">Collect</code> records it as received, <code class="k">Invoice</code> bills it, or tick several for one client and <code class="k">Create one invoice</code>.</li></ul></div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Aged insurance claims</h3><span class="route">/billing/aged-claims</span><span class="gate">biller / owner</span></div>
          <p class="lede">Unpaid claims grouped by insurer, oldest first. Print a report to take into an insurer meeting.</p>
          <div class="cols">
            <div class="block"><h4>The index</h4><ul class="b"><li>Cards: <b>Total outstanding</b> and <b>60+ days</b>, then one card per insurer.</li></ul></div>
            <div class="block"><h4>Per-insurer report</h4><ul class="b"><li>Age tabs <code class="k">All</code> <code class="k">60+</code> <code class="k">90+</code> <code class="k">120+</code>, aging bands, and <code class="k">Print / Save PDF</code>.</li></ul></div>
          </div>
        </div>
      </section>

      <!-- ============ CLIENTS ============ -->
      <section class="grp" id="clients">
        <div class="gh"><h2>Clients</h2><span class="gn">records</span></div>
        <p class="gintro">The roster is the master list of everyone in the practice; each record holds everything a claim or invoice needs.</p>

        <div class="page">
          <div class="ph"><h3>Client roster</h3><span class="route">/billing/clients</span></div>
          <p class="lede">Every client in the practice. Open one, or tick several and build their claims in one run.</p>
          <div class="cols">
            <div class="block"><h4>Columns</h4><ul class="b"><li>Client, DOB (+ age), usual insurer (or <span class="pill self">Self-pay</span>), <b>Seen by</b>, paid, last visit.</li><li>Sort by any heading; filter by insurer or clinician.</li></ul></div>
            <div class="block"><h4>Actions</h4><ul class="b"><li><code class="k">+ New client</code>, and tick several then <code class="k">Generate CMS-1500</code> to batch claims.</li></ul></div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Client record</h3><span class="route">/billing/clients/[id]</span></div>
          <p class="lede">One client's full file. As owner you see and edit every section, including the ones a clinician cannot.</p>
          <div class="dl">
            <div class="row"><dt>Referral banner</dt><dd>Payment-critical. Days left / expiring / expired. Visits after the end date <b>can't be billed</b>. <code class="k">Add / Renew referral</code>.</dd></div>
            <div class="row"><dt>Client record</dt><dd>Identity and insurance details. <code class="k">Edit details</code> to change; a referral sub-block sets the billing window.</dd></div>
            <div class="row"><dt>Insurance deductible &amp; benefit</dt><dd>The insurer's annual figures. <b>Owner, biller and admin can edit these; a clinician sees them read-only.</b></dd></div>
            <div class="row"><dt>Diagnoses</dt><dd>ICD-10 codes for box 21 of the claim. Anyone on the record can edit; changes are logged.</dd></div>
            <div class="row"><dt>Documents &amp; team notes</dt><dd>Intake form, referral letter, uploads, and admin/billing notes the team shares. <b>Team notes are not for clinical or sensitive info.</b></dd></div>
            <div class="row"><dt>Appointments &amp; charges</dt><dd>Every date of service with its status pill. Add, edit, delete, and bulk <code class="k">Change selected…</code>. Generate a CMS-1500 or an invoice from the selection.</dd></div>
            <div class="row"><dt>Session notes</dt><dd>Clinical, encrypted, visible only to that client's treating clinicians. Even as owner you do not see notes for clients you don't treat.</dd></div>
          </div>
          <div class="tip">Only the owner and biller can <b>delete</b> a client; a clinician cannot. The status pill on each charge is the single source of truth for where that visit sits.</div>
        </div>
      </section>

      <!-- ============ INTAKE ============ -->
      <section class="grp" id="intake">
        <div class="gh"><h2>Intake &amp; your day</h2><span class="gn">the rest of the app</span></div>
        <p class="gintro">The billing system sits alongside intake, the schedule and your daily home page. As owner you see all of it, and the schedule shows every clinician.</p>

        <div class="page">
          <div class="ph"><h3>Today</h3><span class="route">/today</span></div>
          <p class="lede">Your daily home page across intake, billing and the team.</p>
          <div class="cols">
            <div class="block"><h4>On the page</h4><ul class="b"><li>A <b>money pipeline</b> card splitting the month into not billed, with insurers, and in bank.</li><li><b>Your areas</b> tiles: Intake, Billing (the overview), Team, Setup.</li></ul></div>
            <div class="block"><h4>Needs attention</h4><ul class="b"><li>Deep links: forms to review, work logged but not yet submitted to insurers, tickets, unread messages, notices.</li></ul></div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Intake dashboard &amp; forms</h3><span class="route">/dashboard</span><span class="route">/dashboard?tab=forms</span></div>
          <p class="lede">Client intake submissions and the shareable form links, scoped to your own caseload.</p>
          <div class="cols">
            <div class="block"><h4>Dashboard tab</h4><ul class="b"><li>KPI filters <b>New / Reviewed / Archived / Total</b> and a searchable submissions list. Each row opens the submission.</li></ul></div>
            <div class="block"><h4>Forms tab</h4><ul class="b"><li>Intake forms, screening measures and follow-up measures, each with a share link to send the right client.</li></ul></div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Schedule</h3><span class="route">/schedule</span></div>
          <p class="lede">The weekly agenda. As owner you see <b>every</b> bookable clinician and can edit any of them.</p>
          <div class="cols">
            <div class="block full"><h4>On the page</h4><ul class="b"><li>A Monday-first week grid with a clinician filter, plus <code class="k">hours</code> and <code class="k">connections</code> links.</li></ul></div>
          </div>
        </div>
      </section>

      <!-- ============ TEAM ============ -->
      <section class="grp" id="team">
        <div class="gh"><h2>Team &amp; tickets</h2><span class="gn">collaboration</span></div>
        <p class="gintro">Chat for quick things, tickets for anything that needs tracking. Keep client names out of both. Attachments up to 4 MB.</p>

        <div class="page">
          <div class="ph"><h3>Notice board</h3><span class="route">/team/notices</span></div>
          <p class="lede">Practice-wide announcements. Post one, and everyone can read and acknowledge.</p>
          <div class="cols">
            <div class="block"><h4>On the page</h4><ul class="b"><li>Pinned notices float to top; meeting notices show a live countdown. Tabs: All, Needs your nod, Meetings.</li></ul></div>
            <div class="block"><h4>Buttons</h4><ul class="b"><li><code class="k">Post a notice</code> with optional meeting time, pin, and ask-to-acknowledge.</li></ul></div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Messages</h3><span class="route">/team/messages</span></div>
          <p class="lede">Direct chats, custom groups, and the whole-team channel. Text, images, files, voice notes.</p>
          <div class="cols">
            <div class="block"><h4>On the page</h4><ul class="b"><li><b>Everyone</b> channel, your groups, DMs. Green dot = online in the last 3 minutes.</li></ul></div>
            <div class="block"><h4>Good to know</h4><ul class="b"><li>Enter sends, Shift+Enter is a new line. Use initials, not client names.</li></ul></div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Tickets</h3><span class="route">/team/tickets</span></div>
          <p class="lede">The tracked, accountable channel for anything needing follow-through (payouts, HR, IT, billing issues).</p>
          <div class="cols">
            <div class="block"><h4>Status lifecycle</h4><ul class="b"><li><b>Not started</b> to <code class="k">Start</code>, <b>Being sorted</b> to <code class="k">Mark done</code> / <code class="k">Need info</code>, <b>Done</b> to <code class="k">Reopen</code>.</li></ul></div>
            <div class="block"><h4>How it works</h4><ul class="b"><li>The "ball" sits with everyone who hasn't replied. Yours shows <b>Your turn</b>; otherwise <b>Waiting on…</b> with a <code class="k">Nudge</code>.</li></ul></div>
          </div>
        </div>
      </section>

      <!-- ============ SETUP ============ -->
      <section class="grp" id="setup">
        <div class="gh"><h2>Setup, the money rules</h2><span class="gn">owner only</span></div>
        <p class="gintro">The rules behind every claim, invoice and payout. The biller sees the claims-and-fees half; the money sections below are <b>yours alone</b>.</p>

        <div class="page">
          <div class="ph"><h3>Setup</h3><span class="route">/billing/config</span><span class="gate">owner / biller (scoped)</span></div>
          <p class="lede">You set the payout math; the biller sets the claim identifiers and fees. Both edit insurers and service codes.</p>
          <div class="cols">
            <div class="block">
              <h4>Your money sections</h4>
              <ul class="b">
                <li><b>Biller commission</b>: a single % of the company's retained share, applied only to the clinicians you tick. It comes out of the practice's cut, never a clinician's payout.</li>
                <li><b>Running expenses</b>: a per-month overhead list (month navigator, <code class="k">+ Add a cost</code>, <code class="k">Save month</code>). Subtracted from collected cash to reach net.</li>
                <li><b>Clinician splits</b>: per person, the <b>Retention %</b>, <b>Other %</b>, <b>Health</b>, <b>Pension %</b>, <b>Biller %</b> and <b>Base %</b>, plus a <b>No payout</b> flag.</li>
              </ul>
            </div>
            <div class="block">
              <h4>How the splits read</h4>
              <ul class="b">
                <li><b>Biller %</b> is that clinician's own biller rate, charged on their insurance collected.</li>
                <li><b>Base %</b> is the share the biller rate is charged on. <code class="k">0</code> = auto (the clinician's after-retention share); a set % is a special deal.</li>
                <li>The <b>Practice %</b> checkbox decides whether the practice-wide biller commission also applies to that clinician.</li>
                <li><b>Pension</b> is charged on the after-retention share. <b>No payout</b> keeps a clinician's collections with the practice.</li>
              </ul>
            </div>
          </div>
          <div class="cols" style="margin-top:8px">
            <div class="block full">
              <h4>Shared with the biller</h4>
              <ul class="b">
                <li><b>Insurers &amp; co-pay</b> (each insurer's co-pay rule and payer claim code) and <b>Service codes</b> (CPT codes with time / fee variants).</li>
                <li><b>Sample data</b>: add or remove sample clients for a demo.</li>
                <li>A <b>processing fee</b> % is set by the builder/admin; you see it read-only, and it is illustrative only.</li>
              </ul>
            </div>
          </div>
          <div class="tip"><b>Every number traces back here.</b> If a payout, claim or the bottom line looks wrong, the cause is almost always a rate, split or expense on this page.</div>
        </div>

        <div class="page">
          <div class="ph"><h3>Worklist</h3><span class="route">/billing/worklist</span></div>
          <p class="lede">The shared list of features and fixes you and the team want built.</p>
          <div class="cols">
            <div class="block"><h4>A feature has</h4><ul class="b"><li>Name, what it does, a flow, priority, status, attachments, and a notes thread.</li></ul></div>
            <div class="block"><h4>Buttons</h4><ul class="b"><li><code class="k">+ Add a feature</code>, then <code class="k">Mark done</code> / <code class="k">Start</code> / <code class="k">Reopen</code> and <code class="k">Ask / reply</code>.</li></ul></div>
          </div>
        </div>
      </section>

      <!-- ============ GLOSSARY ============ -->
      <section class="grp" id="glossary">
        <div class="gh"><h2>Money words</h2></div>
        <p class="gintro">The terms behind the figures. All amounts are KYD.</p>
        <div class="dl">
          <div class="row"><dt>Collected</dt><dd>Cash actually received: co-pays taken at the visit + insurance payments in. <b>Only collected money pays anyone.</b></dd></div>
          <div class="row"><dt>Outstanding</dt><dd>Insurance not yet collected, either to bill or awaiting payment.</dd></div>
          <div class="row"><dt>Retention</dt><dd>The company's cut of collected money, set per clinician. What is left after it is the clinician's share.</dd></div>
          <div class="row"><dt>Biller commission</dt><dd>A share of the company retention, for the clinicians you tick, charged on the after-retention share. It comes out of the practice's cut.</dd></div>
          <div class="row"><dt>Net payout</dt><dd>A clinician's commission earned minus their own pension.</dd></div>
          <div class="row"><dt>Net this month</dt><dd>The bottom line: cash collected minus clinician payouts, biller commission and running expenses.</dd></div>
          <div class="row"><dt>Write-off vs write-down</dt><dd>A claim settled for less than billed. Both are a <b>separate bucket</b>, never counted as collected and never paid out.</dd></div>
          <div class="row"><dt>Aging buckets</dt><dd>How old an unpaid claim is by date of service: 0-14, 15-30, 31-60, and 60+ days (the one that matters).</dd></div>
        </div>
      </section>

      <footer class="foot">
        TIFEC Owner Handbook · generated for a functionality review · reflects the app as built on the feature/billing branch. If a screen differs from this guide, the app is the source of truth, flag it and it'll be updated.
      </footer>
    </main>
  </div>
</div>`;

// ===========================================================================
//  CLINICIAN HANDBOOK
// ===========================================================================
export const CLINICIAN_HANDBOOK_HTML = String.raw`<div class="wrap">
  <header class="mast">
    <p class="eyebrow">TIFEC · Essential Care · Billing</p>
    <h1>The Clinician's Handbook</h1>
    <p class="sub">Every screen you touch as a clinician, grouped by the job it does. Your own clients, your own sessions, and your own payout, and nothing that isn't yours.</p>
    <div class="mchips">
      <span class="mchip">Currency <b>KYD</b></span>
      <span class="mchip">Dates pinned to <b>Cayman time</b></span>
      <span class="mchip">Your role: <b>Clinician</b></span>
      <span class="mchip">For a functionality review</span>
    </div>
  </header>

  <div class="layout">
    <nav class="toc">
      <details open>
        <summary>Contents</summary>
        <p class="tl">The workflows</p>
        <ol>
          <li><a class="plain" href="#start"><span class="n"></span>Start here</a></li>
          <li><a href="#log"><span class="n"></span>Log a session</a></li>
          <li><a href="#payout"><span class="n"></span>My payout</a></li>
          <li><a href="#clients"><span class="n"></span>My clients</a></li>
          <li><a href="#notes"><span class="n"></span>Session notes</a></li>
          <li><a href="#intake"><span class="n"></span>Intake &amp; your day</a></li>
          <li><a href="#team"><span class="n"></span>Team &amp; tickets</a></li>
          <li><a href="#setup"><span class="n"></span>My setup</a></li>
          <li><a class="plain" href="#glossary"><span class="n"></span>Money words</a></li>
        </ol>
      </details>
    </nav>

    <main>
      <!-- ============ START ============ -->
      <section class="grp" id="start">
        <div class="gh"><h2>Start here</h2></div>
        <p class="gintro">Three roles share the app. You are a <b>Clinician</b>: everything you see is scoped to your own caseload. You log your sessions, watch your payout, and keep your clients' records, but you never see another clinician's clients or the practice's money rules.</p>

        <div class="page">
          <div class="ph"><h3>What is yours, and what isn't</h3></div>
          <div class="cols">
            <div class="block">
              <h4>You can</h4>
              <ul class="b">
                <li>Log sessions and edit or delete your own.</li>
                <li>Open and edit your clients' records and charges.</li>
                <li>See your payout, statements and collections report.</li>
                <li>Keep encrypted session notes for clients you treat.</li>
                <li>Set your own private expenses.</li>
              </ul>
            </div>
            <div class="block">
              <h4>You can't</h4>
              <ul class="b">
                <li>See other clinicians' clients or numbers.</li>
                <li>Mark claims billed or collected in the billing queue (that is the biller's job).</li>
                <li>Delete a client, or edit the insurance deductible and benefit pots.</li>
                <li>Change the practice's rates, splits or expenses.</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Your left menu</h3></div>
          <div class="cols">
            <div class="block">
              <h4>Billing</h4>
              <ul class="b">
                <li><code class="k">My payout</code> your month and net pay</li>
                <li><code class="k">My clients</code> your roster</li>
                <li><code class="k">Log a session</code> record a visit</li>
                <li><code class="k">Session notes</code> your clinical notes</li>
              </ul>
            </div>
            <div class="block">
              <h4>Everything else</h4>
              <ul class="b">
                <li><b>Intake</b>: Dashboard and Forms for your clients.</li>
                <li><b>Team</b>: Notice board, Messages, Tickets.</li>
                <li><b>You</b>: My setup, and this Handbook.</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="legend">
          <h4>How to read this guide</h4>
          <div class="legrow">
            <div class="legcol">
              <div class="li"><span class="lb"><code class="k">grey mono</code></span><span>= a real button or label exactly as it appears on screen.</span></div>
              <div class="li"><span class="lb"><span class="route">/billing/…</span></span><span>= the page's web address.</span></div>
            </div>
            <div class="legcol">
              <div class="li"><span class="lb"><span class="pill self">Self-pay</span></span><span>the client pays the full fee at the visit.</span></div>
              <div class="li"><span class="lb"><span class="pill tobill">To bill</span></span><span>insured, waiting for the biller to submit it.</span></div>
              <div class="li"><span class="lb"><span class="pill collected">Collected</span></span><span>cash is in. This is what pays you.</span></div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ LOG ============ -->
      <section class="grp" id="log">
        <div class="gh"><h2>Log a session</h2><span class="gn">your daily habit</span></div>
        <p class="gintro">The one action that starts everything. A logged session becomes a charge on the client's record, and, if insured, a claim the biller can submit. The more accurate you are here, the cleaner your payout.</p>

        <div class="page">
          <div class="ph"><h3>Log a session</h3><span class="route">/billing/sessions/new</span></div>
          <p class="lede">A single form. Fill it top to bottom; the summary card on the right shows where the money goes as you type.</p>
          <div class="cols">
            <div class="block">
              <h4>Who and when</h4>
              <ul class="b">
                <li><b>Someone I've seen before</b> (searchable) or <b>A new client</b> (first, last, date of birth).</li>
                <li><b>Date of service</b> with <code class="k">Today</code> / <code class="k">Yesterday</code> buttons. A date in another month or the future needs a one-time <code class="k">Yes, that's correct</code> confirm.</li>
                <li>Warns you if the same client already has a visit on that date, or if it falls after their referral ended.</li>
              </ul>
            </div>
            <div class="block">
              <h4>How it's paid</h4>
              <ul class="b">
                <li><b>Paid in full at the visit</b> (self-pay, no insurer) or <b>Through insurance</b> (co-pay now, the rest billed).</li>
                <li>Insurance mode reveals the insurer picker.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Codes &amp; value</h4>
              <ul class="b">
                <li>Search service codes, or open <code class="k">See all codes</code>; your <b>most-used</b> codes are one tap away.</li>
                <li>Per code: pick the length variant and a <b>units</b> stepper. Total cost and duration fill in automatically.</li>
                <li>Self-pay visits can take a <b>discount</b> (% off + reason, with a <code class="k">50% Adventist</code> shortcut).</li>
              </ul>
            </div>
            <div class="block">
              <h4>Was it paid?</h4>
              <ul class="b">
                <li>Self-pay: <b>Paid in full</b> / <b>Didn't collect (owed)</b> / <b>Waive</b>.</li>
                <li>Insurance: a suggested <b>co-pay</b> from the insurer's rule, then <b>Collected</b> / <b>Didn't collect</b> / <b>Waive</b>.</li>
              </ul>
            </div>
          </div>
          <div class="tip"><code class="k">Save session</code> takes you to your payout. <code class="k">Save &amp; log another</code> keeps the date and clears the rest, for logging a whole day quickly.</div>
        </div>
      </section>

      <!-- ============ PAYOUT ============ -->
      <section class="grp" id="payout">
        <div class="gh"><h2>My payout</h2><span class="gn">your numbers</span></div>
        <p class="gintro">Your month at a glance: what you earned, what has been collected, and what you take home. Every figure comes from the rates the owner set, so your screen and your printed statement always agree.</p>

        <div class="page">
          <div class="ph"><h3>My payout</h3><span class="route">/billing/me</span></div>
          <p class="lede">Your own month, with a month navigator to step back through history.</p>
          <div class="cols">
            <div class="block">
              <h4>KPI tiles</h4>
              <ul class="b">
                <li><b>Appointments logged</b>, <b>Total earned</b>, <b>Collected at visit</b>.</li>
                <li><b>Insurance collected</b> (this month vs prior, with a <code class="k">report</code> link) and <b>Insurance outstanding</b>.</li>
                <li><b>Co-pays not collected</b> (a <code class="k">Record</code> link) and <b>Co-pays waived</b>; write-offs when there are any.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Payout breakdown</h4>
              <ul class="b">
                <li>Collected this month, then the deductions: <b>company retention</b>, <b>billing</b>, <b>other</b>, <b>health</b>, <b>pension</b>, ending in <b>Net payout</b>.</li>
                <li><code class="k">View payout statement</code> opens the printable version.</li>
              </ul>
            </div>
          </div>
          <div class="cols" style="margin-top:8px">
            <div class="block full">
              <h4>This month's work &amp; sessions</h4>
              <ul class="b">
                <li>A settled-vs-coming-in bar, and a <b>Still to come</b> panel showing what each insurer owes you with an age badge.</li>
                <li>A <b>⚠ Referrals to renew</b> list for clients whose referral is expiring, since you can't bill past the end date.</li>
                <li>Your sessions for the month, with <code class="k">+ Log a session</code>. You can edit or delete your own sessions inline (date, fee, codes, co-pay, status).</li>
              </ul>
            </div>
          </div>
          <div class="mini" style="margin-top:8px">Marking a claim <b>billed</b> or <b>collected</b> in the queue is the biller's job. Here you set a session's status through its edit form, which covers <b>To bill</b>, <b>Awaiting payment</b> and <b>Collected</b>.</div>
        </div>
      </section>

      <!-- ============ CLIENTS ============ -->
      <section class="grp" id="clients">
        <div class="gh"><h2>My clients</h2><span class="gn">your records</span></div>
        <p class="gintro">Only the clients linked to you, and only your own visits with them. Everything a claim or invoice needs lives on the record.</p>

        <div class="page">
          <div class="ph"><h3>My clients</h3><span class="route">/billing/clients</span></div>
          <p class="lede">Your roster. Search, open a client, or tick several and build their claims in one run.</p>
          <div class="cols">
            <div class="block"><h4>Columns</h4><ul class="b"><li>Client, DOB (+ age), insurer, billable session count, paid total, last visit.</li></ul></div>
            <div class="block"><h4>Note</h4><ul class="b"><li>The "Seen by" column and the clinician filter are owner/biller only, so you won't see them; your list is already just your clients.</li></ul></div>
          </div>
        </div>

        <div class="page">
          <div class="ph"><h3>Client record</h3><span class="route">/billing/clients/[id]</span></div>
          <p class="lede">One client's full file. You can edit most of it; a few money pots are read-only.</p>
          <div class="dl">
            <div class="row"><dt>Referral banner</dt><dd>Days left / expiring / expired. Visits after the end date <b>can't be billed</b>. <code class="k">Add / Renew referral</code>.</dd></div>
            <div class="row"><dt>Client record</dt><dd>Identity and insurance, plus the referral window. <code class="k">Edit details</code> to change.</dd></div>
            <div class="row"><dt>Insurance deductible &amp; benefit</dt><dd><b>Read-only for you.</b> Only owner, biller and admin can edit these.</dd></div>
            <div class="row"><dt>Diagnoses &amp; documents</dt><dd>ICD-10 codes for the claim, plus uploads and links. Intake-form links open only for the treating clinician.</dd></div>
            <div class="row"><dt>Appointments &amp; charges</dt><dd>Every visit with its status pill. <code class="k">+ Add a charge</code>, edit or delete a charge, and bulk <code class="k">Change selected…</code>. This editor also has <b>write-off / write-down</b> options. Generate a CMS-1500 or an invoice from the selection.</dd></div>
            <div class="row"><dt>Team notes</dt><dd>Shared admin/billing notes. Add your own; <b>not for clinical or sensitive info.</b></dd></div>
          </div>
          <div class="tip">You can't <b>delete</b> a client. If a client needs removing, raise it with the owner or a ticket.</div>
        </div>
      </section>

      <!-- ============ NOTES ============ -->
      <section class="grp" id="notes">
        <div class="gh"><h2>Session notes</h2><span class="gn">clinical, encrypted</span></div>
        <p class="gintro">Your private clinical record for the clients you treat. Encrypted, and visible only to that client's own clinicians, never the biller or the admin.</p>

        <div class="page">
          <div class="ph"><h3>Session notes</h3><span class="route">/notes</span></div>
          <p class="lede">Pick a client on the left, then read or write on the right. The link only appears when you have linked clients.</p>
          <div class="cols">
            <div class="block">
              <h4>Writing a note</h4>
              <ul class="b">
                <li>Choose a session date and a <b>note format</b>, or <b>paste from Supanote</b> and it splits into the format's sections.</li>
                <li>An <code class="k">Open Supanote</code> link and an <code class="k">Open full chart</code> link are on hand.</li>
                <li>Notes are numbered oldest first and fold open and closed. You can edit or delete <b>your own</b> notes.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Who sees them</h4>
              <ul class="b">
                <li>Only clinicians linked to that client. Access follows the <b>treating relationship</b>, not a billing role.</li>
                <li>The biller and the system admin never see clinical content.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ INTAKE ============ -->
      <section class="grp" id="intake">
        <div class="gh"><h2>Intake &amp; your day</h2><span class="gn">the rest of the app</span></div>
        <p class="gintro">Alongside billing, you have your intake submissions, shareable form links, and a daily home page. All scoped to you.</p>

        <div class="page">
          <div class="ph"><h3>Today</h3><span class="route">/today</span></div>
          <p class="lede">Your daily home page across intake, billing and the team, with deep links to whatever needs attention.</p>
        </div>

        <div class="page">
          <div class="ph"><h3>Intake dashboard &amp; forms</h3><span class="route">/dashboard</span><span class="route">/dashboard?tab=forms</span></div>
          <p class="lede">Your client intake submissions, and the links you share to collect them.</p>
          <div class="cols">
            <div class="block"><h4>Dashboard tab</h4><ul class="b"><li>KPI filters <b>New / Reviewed / Archived / Total</b> and a searchable list. Each row opens the submission. The count of new ones shows as a badge on the menu.</li></ul></div>
            <div class="block"><h4>Forms tab</h4><ul class="b"><li>Your enabled intake forms, screening measures and follow-up measures, each with a share link to send a client.</li></ul></div>
          </div>
        </div>
      </section>

      <!-- ============ TEAM ============ -->
      <section class="grp" id="team">
        <div class="gh"><h2>Team &amp; tickets</h2><span class="gn">collaboration</span></div>
        <p class="gintro">Chat for quick things, tickets for anything that needs tracking. Keep client names out of both. Attachments up to 4 MB.</p>

        <div class="page">
          <div class="ph"><h3>Notice board</h3><span class="route">/team/notices</span></div>
          <p class="lede">Practice-wide announcements. Read and acknowledge; pinned notices and meetings float to the top.</p>
        </div>

        <div class="page">
          <div class="ph"><h3>Messages</h3><span class="route">/team/messages</span></div>
          <p class="lede">Direct chats, groups, and the whole-team channel. Enter sends, Shift+Enter is a new line. Use initials, not client names.</p>
        </div>

        <div class="page">
          <div class="ph"><h3>Tickets</h3><span class="route">/team/tickets</span></div>
          <p class="lede">The tracked channel for anything needing follow-through (your payout questions, IT, HR).</p>
          <div class="cols">
            <div class="block"><h4>How it works</h4><ul class="b"><li>Statuses run <b>Not started</b> to <code class="k">Start</code>, <b>Being sorted</b> to <code class="k">Mark done</code>. The "ball" sits with whoever hasn't replied; yours shows <b>Your turn</b>.</li></ul></div>
          </div>
        </div>
      </section>

      <!-- ============ SETUP ============ -->
      <section class="grp" id="setup">
        <div class="gh"><h2>My setup</h2><span class="gn">just yours</span></div>
        <p class="gintro">The one place you configure something about yourself. Your pay split is set by the owner and shown here read-only.</p>

        <div class="page">
          <div class="ph"><h3>My setup</h3><span class="route">/billing/me/setup</span></div>
          <p class="lede">Your private expenses, and a read-only look at your agreement.</p>
          <div class="cols">
            <div class="block">
              <h4>My expenses</h4>
              <ul class="b">
                <li>A per-month list split into <b>Running</b> (carries forward) and <b>One-off</b> (this month only), with a flip button to move a line between them.</li>
                <li>Your <b>Take-home</b> figure = net payout minus these expenses.</li>
                <li><b>Private to you.</b> Never on your payout statement, never shown to the practice.</li>
              </ul>
            </div>
            <div class="block">
              <h4>My agreement (read-only)</h4>
              <ul class="b">
                <li>Company retention %, billing rate %, health deduction, pension %.</li>
                <li>Only the owner can change these; they feed the payout math.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ GLOSSARY ============ -->
      <section class="grp" id="glossary">
        <div class="gh"><h2>Money words</h2></div>
        <p class="gintro">The terms behind your payout. All amounts are KYD.</p>
        <div class="dl">
          <div class="row"><dt>Collected</dt><dd>Cash actually received: co-pays taken at the visit + insurance payments in. <b>Only collected money pays you.</b></dd></div>
          <div class="row"><dt>Outstanding</dt><dd>Insurance not yet collected, either waiting to be billed or awaiting payment from the insurer.</dd></div>
          <div class="row"><dt>Retention</dt><dd>The company's cut of your collected money. What is left after it is your share.</dd></div>
          <div class="row"><dt>Net payout</dt><dd>Your commission earned minus your own pension. What you are paid for the month.</dd></div>
          <div class="row"><dt>Take-home</dt><dd>Net payout minus your private expenses. Only you ever see this.</dd></div>
          <div class="row"><dt>Co-pay</dt><dd>The client's share of an insured visit. An uncollected co-pay is a loss, not extra revenue.</dd></div>
          <div class="row"><dt>Write-off vs write-down</dt><dd>A claim settled for less than billed. A separate bucket, never counted as collected and never paid out.</dd></div>
        </div>
      </section>

      <footer class="foot">
        TIFEC Clinician Handbook · generated for a functionality review · reflects the app as built on the feature/billing branch. If a screen differs from this guide, the app is the source of truth, flag it and it'll be updated.
      </footer>
    </main>
  </div>
</div>`;

// ===========================================================================
//  ADMIN / BUILDER HANDBOOK
// ===========================================================================
export const ADMIN_HANDBOOK_HTML = String.raw`<div class="wrap">
  <header class="mast">
    <p class="eyebrow">TIFEC · Essential Care · Billing</p>
    <h1>The Admin &amp; Builder Handbook</h1>
    <p class="sub">Your lean oversight menu, plus the one power no one else has: stepping into any role to see the app exactly as they do. What each admin screen is for, and how to move around safely.</p>
    <div class="mchips">
      <span class="mchip">Currency <b>KYD</b></span>
      <span class="mchip">Dates pinned to <b>Cayman time</b></span>
      <span class="mchip">Your role: <b>Admin / builder</b></span>
      <span class="mchip">For a functionality review</span>
    </div>
  </header>

  <div class="layout">
    <nav class="toc">
      <details open>
        <summary>Contents</summary>
        <p class="tl">The workflows</p>
        <ol>
          <li><a class="plain" href="#start"><span class="n"></span>Start here</a></li>
          <li><a href="#viewas"><span class="n"></span>Viewing as a role</a></li>
          <li><a href="#oversight"><span class="n"></span>Logins &amp; oversight</a></li>
          <li><a href="#setup"><span class="n"></span>Setup</a></li>
          <li><a href="#worklist"><span class="n"></span>Worklist</a></li>
          <li><a href="#scheduling"><span class="n"></span>Scheduling</a></li>
          <li><a href="#team"><span class="n"></span>Team &amp; tickets</a></li>
        </ol>
      </details>
    </nav>

    <main>
      <!-- ============ START ============ -->
      <section class="grp" id="start">
        <div class="gh"><h2>Start here</h2></div>
        <p class="gintro">You are the <b>builder / oversight account</b>. Your own menu is deliberately lean: your admin tools and the team channels. You don't get duplicated billing, intake or clinician menus, because you reach those by <b>viewing as</b> the role that owns them.</p>

        <div class="page">
          <div class="ph"><h3>Your menu, and how it differs</h3></div>
          <div class="cols">
            <div class="block">
              <h4>Your left menu</h4>
              <ul class="b">
                <li><code class="k">Today</code> your landing page</li>
                <li><b>Team</b>: Notice board, Messages, Tickets</li>
                <li><b>Admin</b>: <code class="k">Setup</code>, <code class="k">Worklist</code>, <code class="k">Scheduling</code>, <code class="k">Logins &amp; oversight</code></li>
                <li><code class="k">Handbook</code> this guide</li>
              </ul>
            </div>
            <div class="block">
              <h4>Two admins, don't confuse them</h4>
              <ul class="b">
                <li><b>You</b> (the builder, e.g. Akeel) carry this three-role oversight menu.</li>
                <li>The practice <b>owner</b> (Dr. Shion) also has admin rights for oversight, but sees only the owner's own menu, never this builder view.</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="legend">
          <h4>How to read this guide</h4>
          <div class="legrow">
            <div class="legcol">
              <div class="li"><span class="lb"><code class="k">grey mono</code></span><span>= a real button or label exactly as it appears on screen.</span></div>
              <div class="li"><span class="lb"><span class="route">/admin</span></span><span>= the page's web address.</span></div>
            </div>
            <div class="legcol">
              <div class="li"><span class="lb"><span class="gate">admin only</span></span><span>= a page only you (the system admin) can open.</span></div>
              <div class="li"><span class="lb"><span class="pill await">Viewing as</span></span><span>you are currently seeing the app as another role.</span></div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ VIEW AS ============ -->
      <section class="grp" id="viewas">
        <div class="gh"><h2>Viewing as a role</h2><span class="gn">your key power</span></div>
        <p class="gintro">The switcher at the top of your sidebar lets you step into any role and see every page and menu exactly as that person does. This is how you check the owner's, biller's and clinician's screens without a second account.</p>

        <div class="flow">
          <div class="step"><div class="sn">01</div><div class="st">Pick a role</div><div class="sd">Me / Owner / Biller / Clinician at the top of the sidebar.</div></div>
          <div class="step"><div class="sn">02</div><div class="st">You land on their home</div><div class="sd">Owner to overview, Biller to their dashboard, Clinician to their payout.</div></div>
          <div class="step"><div class="sn">03</div><div class="st">Everything renders as them</div><div class="sd">Menu, pages and permissions all match that role.</div></div>
          <div class="step"><div class="sn">04</div><div class="st">Back to my admin</div><div class="sd">The back link returns you to your own menu.</div></div>
        </div>

        <div class="page">
          <div class="ph"><h3>The "Viewing as" switcher</h3><span class="gate">system admin only</span></div>
          <p class="lede">A segmented control under the TIFEC brand: <code class="k">Me</code> <code class="k">Owner</code> <code class="k">Biller</code> <code class="k">Clinician</code>.</p>
          <div class="cols">
            <div class="block">
              <h4>How it works</h4>
              <ul class="b">
                <li>Picking a role stands you in for a real person in it (a set owner, biller and a non-hidden clinician). A button is greyed out if there is no one to stand in for.</li>
                <li>While viewing as someone, a banner reads <b>Back to my admin, you are seeing {name}'s view</b>.</li>
                <li><code class="k">Me</code> or the back link returns you to your own admin menu and lands you on Today.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Good to know</h4>
              <ul class="b">
                <li>It is enforced on the server: only the real system admin can do this. Someone else setting the cookie themselves gets nothing.</li>
                <li>Even this Handbook follows the switch: while you view as a role, opening the Handbook shows <b>that role's</b> guide, not this one.</li>
                <li>This is separate from the local-dev "View as" buttons at the foot of the sidebar, which only appear in development.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ OVERSIGHT ============ -->
      <section class="grp" id="oversight">
        <div class="gh"><h2>Logins &amp; oversight</h2><span class="gn">the admin console</span></div>
        <p class="gintro">Your oversight console. It shows counts, logins and activity, and deliberately <b>never</b> shows client intake answers: PHI stays on the minimum-necessary principle.</p>

        <div class="page">
          <div class="ph"><h3>Logins &amp; oversight</h3><span class="route">/admin</span><span class="gate">system admin</span></div>
          <p class="lede">Submission counts, logins, and activity, with no client data on the page.</p>
          <div class="cols">
            <div class="block">
              <h4>Oversight</h4>
              <ul class="b">
                <li><b>Stat grid</b>: New, Reviewed, Archived, Total submissions across all clinicians.</li>
                <li><b>By clinician</b>: the same counts per person.</li>
                <li><b>Reported issues</b>: feedback clinicians sent from the app.</li>
                <li><b>Recent activity</b>: an audit log of views and changes, paged 10 / 25 / 100 / 500 / All history. Entries older than about two years are pruned.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Managing logins</h4>
              <ul class="b">
                <li><b>Clinician logins</b>: one card per person with a <b>Login active</b> / <b>No login yet</b> badge.</li>
                <li><code class="k">Create login</code> or <code class="k">Reset password</code> (min 8 chars). Share the password securely.</li>
                <li>Head actions: <code class="k">Demo data cleanup</code>, <code class="k">My dashboard</code>, <code class="k">Logout</code>.</li>
                <li><b>Import intake emails</b> and, for practicum clinicians, <b>Import intake clients</b>.</li>
              </ul>
            </div>
          </div>
          <div class="tip">A <b>bootstrap mode</b> exists for setting a clinician's first password before anyone is signed in: <span class="route">/admin?key=…</span> shows only the logins section, no stats and no client data.</div>
        </div>
      </section>

      <!-- ============ SETUP ============ -->
      <section class="grp" id="setup">
        <div class="gh"><h2>Setup</h2><span class="gn">practice &amp; billing config</span></div>
        <p class="gintro">The shared configuration surface. Owner, biller and you reach it; what each of you can edit is scoped by role.</p>

        <div class="page">
          <div class="ph"><h3>Setup</h3><span class="route">/billing/config</span></div>
          <p class="lede">Insurers, service codes, provider details, clinician splits and expenses in one place.</p>
          <div class="cols">
            <div class="block">
              <h4>What lives here</h4>
              <ul class="b">
                <li><b>Insurers &amp; co-pay</b> rules and payer claim codes.</li>
                <li><b>Service codes</b> (CPT) with time / fee variants.</li>
                <li><b>Clinician splits</b>: retention, other, health, pension, biller and base %, no-payout flag (owner-editable).</li>
                <li><b>Practice</b>: biller commission %, running expenses, and CMS-1500 provider identifiers.</li>
              </ul>
            </div>
            <div class="block">
              <h4>Your part</h4>
              <ul class="b">
                <li>The <b>processing fee %</b> is yours to set; the owner sees it read-only, and it is illustrative only.</li>
                <li>For the money rules themselves, view as the owner to see and edit them in context.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ WORKLIST ============ -->
      <section class="grp" id="worklist">
        <div class="gh"><h2>Worklist</h2><span class="gn">what to build next</span></div>
        <p class="gintro">The shared build list for you, the owner and the biller. This is where feature requests and fixes are captured and tracked.</p>

        <div class="page">
          <div class="ph"><h3>Worklist</h3><span class="route">/billing/worklist</span></div>
          <p class="lede">Features and fixes the team wants, with a thread on each.</p>
          <div class="cols">
            <div class="block"><h4>A feature has</h4><ul class="b"><li>Name, what it does, a flow (start to end), priority, status, attachments, a requester, and a notes thread.</li></ul></div>
            <div class="block"><h4>Buttons</h4><ul class="b"><li><code class="k">+ Add a feature</code>, then <code class="k">Mark done</code> / <code class="k">Start</code> / <code class="k">Reopen</code> and <code class="k">Ask / reply</code>.</li></ul></div>
          </div>
        </div>
      </section>

      <!-- ============ SCHEDULING ============ -->
      <section class="grp" id="scheduling">
        <div class="gh"><h2>Scheduling</h2><span class="gn">admin-only prototype</span></div>
        <p class="gintro">An Acuity-style scheduler, admin-only while it is being built, and not yet client-facing. It is fully usable internally now; notifications and the public booking page stay gated until you give the go-ahead.</p>

        <div class="page">
          <div class="ph"><h3>Scheduling</h3><span class="route">/scheduling/calendar</span><span class="gate">system admin only</span></div>
          <p class="lede">Tabs across the top: <code class="k">Calendar</code> <code class="k">Waitlist</code> <code class="k">Insights</code> <code class="k">Appointment types</code> <code class="k">Availability</code> <code class="k">Settings</code>. Cayman time throughout.</p>
          <div class="cols">
            <div class="block">
              <h4>Calendar</h4>
              <ul class="b">
                <li>A Monday-first week grid (7am to 8pm), week nav and a clinician filter, plus <code class="k">+ New</code>.</li>
                <li>Click empty time for a new appointment, drag to <b>block time</b>, drag an appointment to reschedule.</li>
                <li>Status buttons: <b>Booked / Confirmed / Seen / No-show / Cancelled</b>.</li>
                <li>Marking a visit <b>Seen</b> creates a billing session when <b>Connect to billing</b> is on.</li>
              </ul>
            </div>
            <div class="block">
              <h4>The other tabs</h4>
              <ul class="b">
                <li><b>Appointment types</b>: name, duration, buffers, price, capacity, mode, colour, baseline CPT codes, intake form, custom booking questions.</li>
                <li><b>Availability</b>: per-clinician weekly hours, booking rules, days off.</li>
                <li><b>Waitlist</b>, <b>Insights</b> (monthly stats), and <b>Settings</b> (booking page, share links, video, notifications, templates, connect-to-billing).</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ TEAM ============ -->
      <section class="grp" id="team">
        <div class="gh"><h2>Team &amp; tickets</h2><span class="gn">collaboration</span></div>
        <p class="gintro">The same team channels everyone shares. Chat for quick things, tickets for anything that needs tracking. Keep client names out of both.</p>

        <div class="page">
          <div class="ph"><h3>Notice board, Messages, Tickets</h3><span class="route">/team/notices</span><span class="route">/team/messages</span><span class="route">/team/tickets</span></div>
          <div class="cols">
            <div class="block"><h4>Notices &amp; messages</h4><ul class="b"><li>Practice-wide announcements you can post, and direct / group / whole-team chat. Use initials, not client names.</li></ul></div>
            <div class="block"><h4>Tickets</h4><ul class="b"><li>The tracked, accountable channel. Statuses run <b>Not started</b> to <code class="k">Start</code> to <code class="k">Mark done</code>; the "ball" sits with whoever hasn't replied.</li></ul></div>
          </div>
        </div>
      </section>

      <footer class="foot">
        TIFEC Admin &amp; Builder Handbook · generated for a functionality review · reflects the app as built on the feature/billing branch. If a screen differs from this guide, the app is the source of truth, flag it and it'll be updated.
      </footer>
    </main>
  </div>
</div>`;

// The signed-in person's role picks the handbook. An admin sees their own guide;
// while a system admin "views as" another role, getCurrentClinician returns that
// person, so this naturally hands back that role's handbook instead.
export function handbookHtmlFor(
  role: "owner" | "biller" | "clinician",
  isAdmin: boolean,
): string {
  if (isAdmin) return ADMIN_HANDBOOK_HTML;
  if (role === "owner") return OWNER_HANDBOOK_HTML;
  if (role === "clinician") return CLINICIAN_HANDBOOK_HTML;
  return HANDBOOK_HTML;
}
