/* SABHA — app logic. Security notes:
   - All user text is escaped before display; links are limited to http(s).
   - No inline event handlers (works under a strict Content-Security-Policy).
   - The database (schema.sql) enforces every permission; the screen only mirrors it.
   - Supabase library is pinned to one version and checked with Subresource Integrity. */
(() => {
'use strict';
const CONFIG = window.SABHA_CONFIG || {};
const DEMO = !CONFIG.SUPABASE_URL;
const SUPABASE_JS = { src: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js',
  integrity: 'sha384-uteMfOloLDGt042uDz+xHGF3ym63/WQ6rFq7murQRG8Ih7QrXGEGNtWd8688sb4O' };

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
const safeUrl = u => { try { const x = new URL(String(u || '').trim()); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; } catch (e) { return ''; } };
const normUrl = u => { u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; return safeUrl(u); };
const ext = (u, label) => { const h = safeUrl(u); return h ? `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>` : ''; };
const isId = s => /^[A-Za-z0-9-]{1,64}$/.test(String(s || ''));
const mem = {};
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : (k in mem ? mem[k] : d); } catch (e) { return k in mem ? mem[k] : d; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const ROLE = { founder: 'Founder', business: 'Business owner', investor: 'Investor', service: 'Advisor' };
const POST_TYPES = ['Partnership', 'Supplier needed', 'Distribution', 'Buying / acquisition', 'Seeking advice', 'Offering'];
const STAGES = ['Pre-seed', 'Seed', 'Pre-Series A', 'Series A', 'Series B+', 'Profitable / bootstrapped'];
const REVENUE = ['Pre-revenue', 'Under ₹50 lakh', '₹50 lakh – ₹5 crore', '₹5 – ₹25 crore', '₹25 – ₹100 crore', '₹100 crore+'];
const INDUSTRIES = ['Manufacturing', 'Textiles & apparel', 'Consumer / D2C', 'SaaS & tech', 'Fintech', 'Healthcare', 'Food & agri', 'Real estate', 'Logistics', 'Education', 'Clean energy', 'Services', 'Other'];
const today = () => new Date().toISOString().slice(0, 10);
const plus = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const opts = (arr, sel) => arr.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
const first = n => esc(String(n || '').split(' ')[0]);
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3000); }
const FRIENDLY = /^(Limit reached|An application|We are receiving|You already|member not available|Application|This event)/;
const errMsg = e => { const m = String((e && e.message) || ''); return FRIENDLY.test(m) ? m : (/duplicate key.*applications/.test(m) ? 'An application for this email is already under review.' : 'Something went wrong. Please try again.'); };
function avatar(m, cls = '') { const n = (m && m.name) || '?'; return `<div class="av ${cls}">${esc(n.split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase())}</div>`; }
function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  if (s < 86400 * 30) return Math.round(s / 86400) + ' d ago';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formData(form) { const o = {}; new FormData(form).forEach((v, k) => o[k] = String(v).trim()); return o; }
function modal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.add('on'); const f = $('#modalBody input,#modalBody textarea'); if (f) setTimeout(() => f.focus(), 50); }
function closeModal() { $('#modal').classList.remove('on'); $('#modalBody').innerHTML = ''; }
const ICON = {
  hub: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/></svg>',
  events: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  feed: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  deals: '<svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>',
  members: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.8-3.3 3.2-5 6-5s5.2 1.7 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.3.2 4 1.7 5 4.3"/></svg>',
  intros: '<svg viewBox="0 0 24 24"><path d="M4 7h11l-3-3M20 17H9l3 3"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1-4 4-6 7.5-6s6.5 2 7.5 6"/></svg>',
  admin: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.4-7 10-4-1.6-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>'
};

/* ============================================================ DEMO DATA (browser only) */
const DemoAPI = (() => {
  const D = k => ls.get('sabha3_' + k, null), S = (k, v) => ls.set('sabha3_' + k, v);
  const ago_ = n => new Date(Date.now() - n * 86400000).toISOString();
  function seed() {
    if (D('seeded')) return;
    const m = [
      { id: 'm1', name: 'Aarav Menon', role: 'founder', company: 'Kiln Robotics', headline: 'Low-cost automation for small Indian factories', city: 'Coimbatore', industry: 'Manufacturing', stage: 'Seed', revenue_band: 'Under ₹50 lakh', bio: 'Engineer turned founder. We retrofit old machines with sensors so small factories can see downtime in real time.', seeking: 'Pre-Series A investors, pilot customers in auto-component units', offering: 'Happy to share what we learnt selling to MSMEs', traction: '14 paying factories across 3 states', plan: 'founding', paid_until: plus(25) },
      { id: 'm2', name: 'Meera Iyer', role: 'investor', company: 'Angel investor', headline: 'Angel · former operator in consumer brands', city: 'Bengaluru', industry: 'Consumer / D2C', bio: 'Cheques of ₹10–50 lakh in consumer, food and climate. Prefer founders with early revenue.', seeking: 'Consumer and food brands with repeat customers', offering: 'Retail distribution, brand positioning', traction: '11 angel investments since 2019', plan: 'investor' },
      { id: 'm3', name: 'Rohit Bansal', role: 'business', company: 'Bansal Weaves', headline: 'Third-generation knitwear manufacturer, exporting to the EU', city: 'Tiruppur', industry: 'Textiles & apparel', revenue_band: '₹25 – ₹100 crore', bio: 'Knitwear manufacturing with 600 people. Adding sustainable lines.', seeking: 'Recycled-yarn suppliers, D2C brand partners', offering: 'Contract manufacturing capacity, export know-how', traction: '', plan: 'business', paid_until: plus(200) },
      { id: 'm4', name: 'Sana Qureshi', role: 'founder', company: 'Ledgerly', headline: 'Accounting automation for Indian SMEs', city: 'Hyderabad', industry: 'Fintech', stage: 'Pre-Series A', revenue_band: '₹50 lakh – ₹5 crore', bio: 'We plug into Tally and bank feeds and close the books every week instead of every quarter.', seeking: 'Distribution through CA firms, Series A conversations', offering: 'A free review of your finance stack', traction: '1,100 SMEs on the platform', plan: 'founder', paid_until: plus(12) },
      { id: 'm5', name: 'Vikram Desai', role: 'investor', company: 'Desai Family Office', headline: 'Family office · manufacturing and B2B', city: 'Mumbai', industry: 'Manufacturing', bio: 'Minority and control investments in profitable B2B and manufacturing businesses.', seeking: 'B2B businesses with ₹5 crore+ revenue', offering: 'Board experience, banking relationships', traction: '', plan: 'investor' },
      { id: 'm6', name: 'Priya Nair', role: 'service', company: 'Nair & Co. Chartered Accountants', headline: 'Fundraising readiness and due diligence', city: 'Chennai', industry: 'Services', bio: 'I help founders get books, cap table and compliance ready before a raise.', seeking: 'Founders preparing for a round', offering: 'A 30-minute diligence checklist call', traction: '', plan: 'business', paid_until: plus(60) },
      { id: 'm7', name: 'Karthik Raman', role: 'business', company: 'Raman Foods', headline: 'Regional snack brand, 40 distributors in South India', city: 'Madurai', industry: 'Food & agri', revenue_band: '₹5 – ₹25 crore', bio: 'Traditional snacks, modern packaging. Expanding to Maharashtra.', seeking: 'Distribution in West India, growth capital', offering: 'Co-manufacturing for other food brands', traction: '', status: 'approved' },
      { id: 'admin', name: 'Club Admin', role: 'business', company: 'Sabha', headline: 'Membership desk', city: 'Coimbatore', industry: 'Services', bio: 'Admin account for this demo.', plan: 'comp', is_admin: true }
    ];
    m.forEach((x, i) => { x.status = x.status || 'active'; x.created_at = ago_(40 - i); x.email = x.id + '@demo.sabha'; x.website = x.website || ''; x.linkedin = x.linkedin || ''; });
    S('members', m);
    S('posts', [
      { id: uid(), author_id: 'm3', type: 'Supplier needed', title: 'Recycled polyester yarn, 20 tonnes a month', body: 'GRS-certified preferred. Consistent quality for an EU buyer starting Q1. Open to a long-term contract.', created_at: ago_(1) },
      { id: uid(), author_id: 'm4', type: 'Partnership', title: 'Partnering with CA firms in tier-2 cities', body: 'Revenue share for every SME you bring to Ledgerly. Looking for ten partner firms in Tamil Nadu, Kerala and Karnataka.', created_at: ago_(2) },
      { id: uid(), author_id: 'm2', type: 'Seeking advice', title: 'What made quick-commerce listings work for you?', body: 'Writing a short guide for the brands I back. I would value what worked and what did not.', created_at: ago_(4) },
      { id: uid(), author_id: 'm6', type: 'Offering', title: 'A fundraising-readiness checklist for members', body: 'Cap table, compliance, books, contracts. Tap "I\'m interested" and I will send it over.', created_at: ago_(6) }
    ]);
    S('deals', [
      { id: uid(), founder_id: 'm1', company: 'Kiln Robotics', sector: 'Manufacturing', stage: 'Pre-Series A', raising: '₹4 crore', valuation: 'Open to discussion', summary: 'Plug-in sensor kits that give small factories live downtime data. 14 paying factories; raising to build a sales team across five industrial clusters.', deck_url: '', created_at: ago_(3) },
      { id: uid(), founder_id: 'm4', company: 'Ledgerly', sector: 'Fintech', stage: 'Series A', raising: '₹15 crore', valuation: '', summary: 'Weekly book-closing for SMEs through CA partners. Raising to grow the partner network and launch payroll.', deck_url: '', created_at: ago_(8) }
    ]);
    S('intros', [{ id: uid(), from_id: 'm2', to_id: 'm1', context: 'Round · Kiln Robotics', message: 'Aarav, the MSME traction is interesting. Would a 20-minute call next week work?', status: 'pending', created_at: ago_(1) }]);
    S('applications', [
      { id: uid(), name: 'Neha Kapoor', email: 'neha@demo.sabha', phone: '', role: 'founder', company: 'Greenbox Packaging', website: '', city: 'Pune', gst_cin: 'Provided', linkedin: '', industry: 'Manufacturing', revenue_band: 'Under ₹50 lakh', stage: 'Seed', seeking: 'Seed investors, FMCG customers', referral: 'Instagram', status: 'pending', created_at: ago_(0.3) },
      { id: uid(), name: 'Arjun Shetty', email: 'arjun@demo.sabha', phone: '', role: 'investor', company: 'Angel', website: '', city: 'Mangaluru', gst_cin: '', linkedin: '', industry: 'SaaS & tech', revenue_band: '', stage: '', seeking: 'Early SaaS deals, ₹15–25 lakh cheques', referral: 'A member', status: 'pending', created_at: ago_(1.2) }
    ]);
    const at = (d, h) => { const x = new Date(Date.now() + d * 86400000); x.setHours(h, 0, 0, 0); return x.toISOString(); };
    S('events', [
      { id: 'e1', title: 'Founders & Family Offices — Pitch Night', kind: 'Pitch night', starts_at: at(9, 18), city: 'Coimbatore', venue: 'Members are told the venue after RSVP', join_url: '', description: 'Five founders pitch for seven minutes each to verified investors. Drinks and introductions after.', seats: 40, created_at: ago_(2) },
      { id: 'e2', title: 'Exporting to the EU after CBAM', kind: 'Roundtable', starts_at: at(16, 17), city: 'Online', venue: 'Online', join_url: 'https://meet.example.com/sabha-eu', description: 'A closed-door roundtable for manufacturers on carbon reporting and EU buyers.', seats: 20, created_at: ago_(1) },
      { id: 'e3', title: 'Owners’ Dinner — Chennai', kind: 'Dinner', starts_at: at(23, 20), city: 'Chennai', venue: 'Shared with confirmed guests', join_url: '', description: 'Twelve owners, one long table, no presentations.', seats: 12, created_at: ago_(1) }
    ]);
    S('rsvps', [{ event_id: 'e1', member_id: 'm2' }, { event_id: 'e1', member_id: 'm3' }, { event_id: 'e3', member_id: 'm6' }]);
    S('as', 'admin'); S('seeded', true);
  }
  seed();
  const all = () => D('members') || [];
  const byId = id => all().find(m => m.id === id);
  const access = m => !!m && m.status === 'active' && (m.role === 'investor' || m.plan === 'comp' || (m.paid_until && m.paid_until >= today()));
  const pub = m => m && ({ id: m.id, name: m.name, role: m.role, company: m.company, headline: m.headline, city: m.city, industry: m.industry, stage: m.stage,
    revenue_band: m.revenue_band, website: m.website, linkedin: m.linkedin, bio: m.bio, seeking: m.seeking, offering: m.offering, traction: m.traction, status: m.status, created_at: m.created_at });
  const meId = () => D('as');
  const me = () => byId(meId());
  const visible = id => { const m = byId(id); return m && (id === meId() || me()?.is_admin || (access(me()) && access(m))) ? pub(m) : null; };
  const limit = (list, key, id, n, days) => list.filter(x => x[key] === id && Date.now() - new Date(x.created_at) < days * 86400000).length >= n;
  return {
    async session() { const m = me(); return m ? { ...pub(m), is_admin: !!m.is_admin, plan: m.plan, paid_until: m.paid_until, access: access(m) } : null; },
    async demoUsers() { return all(); },
    async setDemoUser(id) { S('as', id || null); },
    async signIn() {},
    async signOut() { S('as', null); },
    async apply(a) {
      const l = D('applications') || [];
      if (l.some(x => x.email === a.email && x.status === 'pending')) throw new Error('An application for this email is already under review.');
      l.unshift({ ...a, id: uid(), status: 'pending', created_at: new Date().toISOString() }); S('applications', l);
    },
    async listMembers() { return all().filter(m => access(m)).map(m => visible(m.id)).filter(Boolean); },
    async getMember(id) { return visible(id); },
    async contactFor(id) {
      const m = byId(id), my = meId(); if (!m) return null;
      const ok = id === my || me()?.is_admin || (access(me()) && access(m) && (D('intros') || []).some(i => i.status === 'accepted' && ((i.from_id === my && i.to_id === id) || (i.to_id === my && i.from_id === id))));
      return ok ? { email: m.email, phone: m.phone || '' } : null;
    },
    async updateMe(p) { const l = all(), i = l.findIndex(m => m.id === meId()); const allowed = ['name', 'company', 'headline', 'city', 'industry', 'stage', 'revenue_band', 'website', 'linkedin', 'bio', 'seeking', 'offering', 'traction']; allowed.forEach(k => { if (k in p) l[i][k] = p[k]; }); S('members', l); },
    async listPosts() { if (!access(me())) return []; return (D('posts') || []).map(p => ({ ...p, author: visible(p.author_id) })).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async createPost(p) { const l = D('posts') || []; if (limit(l, 'author_id', meId(), 5, 1)) throw new Error('Limit reached: 5 posts per day.'); l.unshift({ ...p, id: uid(), author_id: meId(), created_at: new Date().toISOString() }); S('posts', l); },
    async deletePost(id) { S('posts', (D('posts') || []).filter(p => !(p.id === id && (p.author_id === meId() || me().is_admin)))); },
    async listDeals() { const m = me(); return (D('deals') || []).filter(d => m.is_admin || d.founder_id === m.id || (access(m) && m.role === 'investor')).map(d => ({ ...d, founder: visible(d.founder_id) })).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async createDeal(d) { const l = D('deals') || []; if (l.filter(x => x.founder_id === meId()).length >= 3) throw new Error('Limit reached: 3 rounds per member. Remove an old one first.'); l.unshift({ ...d, id: uid(), founder_id: meId(), created_at: new Date().toISOString() }); S('deals', l); },
    async deleteDeal(id) { S('deals', (D('deals') || []).filter(d => !(d.id === id && (d.founder_id === meId() || me().is_admin)))); },
    async requestIntro(to_id, context, message) {
      const l = D('intros') || [], my = meId();
      if (l.some(i => i.from_id === my && i.to_id === to_id && i.status === 'pending')) throw new Error('You already have a pending request with this member.');
      if (limit(l, 'from_id', my, 10, 1)) throw new Error('Limit reached: 10 intro requests per day.');
      l.unshift({ id: uid(), from_id: my, to_id, context, message, status: 'pending', created_at: new Date().toISOString() }); S('intros', l);
    },
    async listIntros() { const my = meId(); return (D('intros') || []).filter(i => i.from_id === my || i.to_id === my).map(i => ({ ...i, from: visible(i.from_id), to: visible(i.to_id) })); },
    async respondIntro(id, status) { const l = D('intros') || []; const i = l.find(x => x.id === id && x.to_id === meId() && x.status === 'pending'); if (i) i.status = status; S('intros', l); },
    async listApplications() { return D('applications') || []; },
    async decideApplication(app, decision) {
      const l = D('applications') || []; const a = l.find(x => x.id === app.id && x.status === 'pending'); if (!a) return; a.status = decision; S('applications', l);
      if (decision === 'approved' && !all().some(m => m.email === a.email)) {
        const ms = all(); ms.push({ id: uid(), name: a.name, email: a.email, role: a.role, company: a.company, headline: '', city: a.city, industry: a.industry || '', stage: a.stage || '', revenue_band: a.revenue_band || '',
          website: a.website, linkedin: a.linkedin, bio: '', seeking: a.seeking, offering: '', traction: '', status: a.role === 'investor' ? 'active' : 'approved', plan: a.role === 'investor' ? 'investor' : '', created_at: new Date().toISOString() });
        S('members', ms);
      }
    },
    async listAllMembers() { return all().map(m => ({ ...m })); },
    async listEvents() {
      const m = me(); if (!(access(m) || m?.is_admin)) return [];
      const r = D('rsvps') || [];
      return (D('events') || []).map(e => ({ ...e, going: r.filter(x => x.event_id === e.id).length, mine: r.some(x => x.event_id === e.id && x.member_id === meId()),
        guests: r.filter(x => x.event_id === e.id).map(x => visible(x.member_id)).filter(Boolean) })).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    },
    async rsvp(id) {
      const e = (D('events') || []).find(x => x.id === id), r = D('rsvps') || [];
      if (!e || new Date(e.starts_at) < new Date()) throw new Error('This event is no longer open.');
      if (r.filter(x => x.event_id === id).length >= e.seats) throw new Error('This event is full.');
      if (!r.some(x => x.event_id === id && x.member_id === meId())) r.push({ event_id: id, member_id: meId() }); S('rsvps', r);
    },
    async cancelRsvp(id) { S('rsvps', (D('rsvps') || []).filter(x => !(x.event_id === id && x.member_id === meId()))); },
    async createEvent(e) { const l = D('events') || []; l.push({ ...e, id: uid(), created_at: new Date().toISOString() }); S('events', l); },
    async deleteEvent(id) { S('events', (D('events') || []).filter(e => e.id !== id)); S('rsvps', (D('rsvps') || []).filter(x => x.event_id !== id)); },
    async setMember(id, p) { const l = all(), m = l.find(x => x.id === id); m.status = p.status; m.plan = p.plan || ''; m.paid_until = p.paid_until || ''; S('members', l); }
  };
})();

/* ============================================================ LIVE DATA (Supabase) */
function LiveAPI() {
  const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });
  const PUB = 'id,name,role,company,headline,city,industry,stage,revenue_band,website,linkedin,bio,seeking,offering,traction,status,created_at';
  const CARD = 'id,name,role,company,headline,city';
  let me = null;
  const ok = r => { if (r.error) throw new Error(r.error.message); return r.data; };
  return {
    sb,
    async session() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return (me = null);
      const r = await sb.rpc('my_member');
      me = r.data || { none: true, email: data.session.user.email };
      return me;
    },
    async signIn(email) { ok(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } })); },
    async signOut() { await sb.auth.signOut(); me = null; },
    async apply(a) { ok(await sb.from('applications').insert(a)); },
    async listMembers() { return ok(await sb.from('members').select(PUB).order('created_at', { ascending: false }).limit(500)); },
    async getMember(id) { return (await sb.from('members').select(PUB).eq('id', id).maybeSingle()).data; },
    async contactFor(id) { return (await sb.from('member_private').select('email,phone').eq('member_id', id).maybeSingle()).data || null; },
    async updateMe(p) { const allowed = ['name', 'company', 'headline', 'city', 'industry', 'stage', 'revenue_band', 'website', 'linkedin', 'bio', 'seeking', 'offering', 'traction']; const q = {}; allowed.forEach(k => { if (k in p) q[k] = p[k]; }); ok(await sb.from('members').update(q).eq('id', me.id)); },
    async listPosts() { return ok(await sb.from('posts').select(`id,type,title,body,created_at,author_id,author:members(${CARD})`).order('created_at', { ascending: false }).limit(100)); },
    async createPost(p) { ok(await sb.from('posts').insert({ type: p.type, title: p.title, body: p.body, author_id: me.id })); },
    async deletePost(id) { ok(await sb.from('posts').delete().eq('id', id)); },
    async listDeals() { return ok(await sb.from('deals').select(`*,founder:members(${CARD})`).order('created_at', { ascending: false }).limit(100)); },
    async createDeal(d) { ok(await sb.from('deals').insert({ company: d.company, sector: d.sector, stage: d.stage, raising: d.raising, valuation: d.valuation, summary: d.summary, deck_url: d.deck_url, founder_id: me.id })); },
    async deleteDeal(id) { ok(await sb.from('deals').delete().eq('id', id)); },
    async requestIntro(to_id, context, message) {
      const r = await sb.from('intros').insert({ from_id: me.id, to_id, context, message });
      if (r.error && /intros_one_pending|duplicate/.test(r.error.message)) throw new Error('You already have a pending request with this member.');
      ok(r);
    },
    async listIntros() { return ok(await sb.from('intros').select(`*,from:members!intros_from_id_fkey(${CARD}),to:members!intros_to_id_fkey(${CARD})`).order('created_at', { ascending: false }).limit(200)); },
    async respondIntro(id, status) { ok(await sb.from('intros').update({ status }).eq('id', id)); },
    async listApplications() { return ok(await sb.from('applications').select('*').order('created_at', { ascending: false }).limit(500)); },
    async decideApplication(app, decision) { ok(await sb.rpc('decide_application', { app_id: app.id, decision })); },
    async listAllMembers() { return ok(await sb.from('admin_members').select('*').order('created_at', { ascending: false })); },
    async listEvents() {
      const ev = ok(await sb.from('events').select('*').order('starts_at').limit(100));
      const rs = ok(await sb.from('rsvps').select(`event_id,member_id,member:members(${CARD})`).limit(5000));
      return ev.map(e => ({ ...e, going: rs.filter(x => x.event_id === e.id).length, mine: rs.some(x => x.event_id === e.id && x.member_id === me.id), guests: rs.filter(x => x.event_id === e.id && x.member).map(x => x.member) }));
    },
    async rsvp(id) { const r = await sb.from('rsvps').insert({ event_id: id, member_id: me.id }); if (r.error && /duplicate/.test(r.error.message)) return; if (r.error) throw new Error(/full|no longer open/.test(r.error.message) ? r.error.message.replace(/^.*?(This event)/, '$1') : r.error.message); },
    async cancelRsvp(id) { ok(await sb.from('rsvps').delete().eq('event_id', id).eq('member_id', me.id)); },
    async createEvent(e) { ok(await sb.from('events').insert({ title: e.title, kind: e.kind, starts_at: e.starts_at, city: e.city, venue: e.venue, join_url: e.join_url, description: e.description, seats: +e.seats || 30 })); },
    async deleteEvent(id) { ok(await sb.from('events').delete().eq('id', id)); },
    async setMember(id, p) { ok(await sb.rpc('admin_set_member', { mid: id, new_status: p.status, new_plan: p.plan || '', new_paid_until: p.paid_until || null })); }
  };
}

/* ============================================================ ART (original SVG illustrations; swap for photos via CONFIG.IMAGES) */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function skyline(seed = 7, opts = {}) {
  const r = rng(seed), W = 1600, H = 900, horizon = opts.horizon || 640;
  let b = '', w = '';
  const layers = [[0.55, '#1a2a66', 150, 330], [0.8, '#101d52', 90, 420], [1, '#08133b', 60, 520]];
  layers.forEach(([depth, col, minH, maxH], li) => {
    let x = -20;
    while (x < W) {
      const bw = 40 + r() * 110 * depth, bh = minH + r() * (maxH - minH);
      const y = horizon - bh + li * 60;
      b += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${bw.toFixed(0)}" height="${(H - y).toFixed(0)}" fill="${col}"/>`;
      if (r() > .82) b += `<rect x="${(x + bw / 2 - 2).toFixed(0)}" y="${(y - 40).toFixed(0)}" width="4" height="40" fill="${col}"/>`;
      if (li === 2 || (li === 1 && r() > .4)) for (let wy = y + 14; wy < Math.min(H, y + bh); wy += 18) for (let wx = x + 8; wx < x + bw - 8; wx += 14)
        if (r() > .82) w += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="5" height="7" fill="#ffd89a" opacity="${(.25 + r() * .6).toFixed(2)}"/>`;
      x += bw + r() * 8;
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs>
    <linearGradient id="sk${seed}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1a4a"/><stop offset=".55" stop-color="#3a3f7a"/><stop offset=".8" stop-color="#b9806a"/><stop offset="1" stop-color="#e8b783"/></linearGradient>
    <radialGradient id="sn${seed}" cx="${opts.sun || .7}" cy=".72" r=".35"><stop offset="0" stop-color="#ffd7a1" stop-opacity=".75"/><stop offset="1" stop-color="#ffd7a1" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#sk${seed})"/><rect width="${W}" height="${H}" fill="url(#sn${seed})"/>${b}${w}</svg>`;
}
function lines(seed = 3) {
  const r = rng(seed); let p = '';
  for (let i = 0; i < 14; i++) { const x = r() * 1600; p += `<path d="M${x.toFixed(0)} 900 L${(x + 200 - r() * 400).toFixed(0)} 0" stroke="rgba(255,255,255,.07)" stroke-width="1"/>`; }
  for (let i = 0; i < 9; i++) { const y = 80 + i * 95; p += `<path d="M0 ${y} H1600" stroke="rgba(255,255,255,.05)"/>`; }
  return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${p}<circle cx="1250" cy="200" r="260" fill="none" stroke="rgba(255,255,255,.08)"/><circle cx="1250" cy="200" r="170" fill="none" stroke="rgba(255,255,255,.06)"/></svg>`;
}
const ART = {
  deals: '<path d="M200 70l90 52v104l-90 52-90-52V122z M200 70v104m0 0l90-52m-90 52l-90-52 M200 174v104" />',
  opps: '<path d="M90 80h220M90 120h220M90 160h150M90 200h190M90 240h120"/><circle cx="300" cy="230" r="34"/>',
  intros: '<circle cx="140" cy="160" r="52"/><circle cx="260" cy="160" r="52"/><path d="M118 160h164m-24-18l24 18-24 18"/>',
  directory: '<g>' + Array.from({ length: 12 }, (_, i) => `<circle cx="${110 + (i % 4) * 60}" cy="${95 + Math.floor(i / 4) * 64}" r="20"/>`).join('') + '</g>',
  events: '<rect x="110" y="80" width="180" height="170" rx="6"/><path d="M110 125h180M150 60v40M250 60v40"/><circle cx="200" cy="188" r="26"/>',
  desk: '<path d="M200 60l100 40v70c0 60-42 104-100 128-58-24-100-68-100-128v-70z"/><path d="M160 170l28 28 56-56"/>'
};
const art = k => `<svg viewBox="0 0 400 320" preserveAspectRatio="xMidYMid meet" aria-hidden="true" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.4">${ART[k]}</svg>`;
const IMG = k => { const u = (CONFIG.IMAGES || {})[k]; return u && /^(img\/|\.\/img\/)[\w\-./]+\.(jpe?g|png|webp|avif)$/i.test(u) ? u : ''; };
const bgArt = (k, fallback) => IMG(k) ? `<div class="bg photo" style="background-image:url('${esc(IMG(k))}')"></div>` : `<div class="bg">${fallback}</div>`;

/* ============================================================ ROUTER (hash names only) */
let API, ME = null, VIEW_ID = null;
const APP_VIEWS = ['hub', 'feed', 'deals', 'events', 'members', 'intros', 'profile', 'admin', 'member'];
const PUBLIC_VIEWS = { home: viewHome, apply: viewApply, login: viewLogin, privacy: viewPrivacy, terms: viewTerms };
const go = h => { if (location.hash === '#' + h) route(); else location.hash = h; };

function loadSupabase() {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = SUPABASE_JS.src; s.integrity = SUPABASE_JS.integrity; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
    s.onload = res; s.onerror = () => rej(new Error('Could not load the secure sign-in library.'));
    document.head.appendChild(s);
  });
}
async function boot() {
  if (DEMO) API = DemoAPI;
  else {
    await loadSupabase();
    API = LiveAPI();
    API.sb.auth.onAuthStateChange(ev => {
      if (ev === 'SIGNED_IN') { if (location.search) history.replaceState(null, '', location.pathname + location.hash); if (!APP_VIEWS.includes(location.hash.slice(1))) go('hub'); }
      if (ev === 'SIGNED_OUT') go('home');
    });
  }
  document.addEventListener('click', onClick);
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeMega(); } });
  window.addEventListener('hashchange', route);
  route();
}
function onClick(e) {
  const t = e.target.closest('[data-go],[data-show],[data-close],[data-signout],[data-scroll],[data-portal],[data-mega]');
  if (!e.target.closest('.mega,[data-mega]')) closeMega();
  if (!t) return;
  if (t.dataset.mega !== undefined) { e.preventDefault(); return toggleMega(t); }
  if (t.dataset.close !== undefined) { e.preventDefault(); return closeModal(); }
  if (t.dataset.portal !== undefined) { e.preventDefault(); closeMega(); return portalModal(); }
  if (t.dataset.signout !== undefined) { e.preventDefault(); return API.signOut().then(() => go('home')); }
  if (t.dataset.show) { e.preventDefault(); if (isId(t.dataset.show)) { VIEW_ID = t.dataset.show; closeModal(); go('member'); } return; }
  if (t.dataset.scroll) {
    e.preventDefault(); closeMega(); const id = t.dataset.scroll, el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' }); else { go('home'); setTimeout(() => document.getElementById(id)?.scrollIntoView(), 150); } return;
  }
  if (t.dataset.go) { e.preventDefault(); closeModal(); closeMega(); go(t.dataset.go); }
}
async function route() {
  closeModal(); closeMega();
  const h = (location.hash || '').slice(1) || 'home';
  ME = await API.session().catch(() => null);
  if (DEMO) await renderDemoBar();
  window.scrollTo(0, 0);
  if (APP_VIEWS.includes(h)) {
    if (!ME) return go('login');
    if (ME.none) return renderPublic(viewNotMember, true);
    if (ME.status === 'suspended') return renderPublic(viewSuspended, true);
    if (!ME.access) return renderPublic(ME.status === 'active' ? viewRenew : viewPaywall, true);
    if (h === 'admin' && !ME.is_admin) return go('hub');
    return renderHub(h);
  }
  if (h === 'login' && ME && ME.access) return go('hub');
  renderPublic(PUBLIC_VIEWS[h] || viewHome, h !== 'home' && !!PUBLIC_VIEWS[h] ? 'hero' : false);
}
async function renderDemoBar() {
  const bar = $('#demobar'); bar.hidden = false; document.body.classList.add('demo');
  const users = await API.demoUsers();
  bar.innerHTML = `<div class="wrap"><b>Demo mode</b><span class="tx">Sample members, saved only in this browser. Connect Supabase to go live.</span>
    <span class="sp tx">View as</span>
    <select id="demoAs" aria-label="View the demo as"><option value="">A visitor</option>${users.map(u => `<option value="${esc(u.id)}" ${ME && ME.id === u.id ? 'selected' : ''}>${esc(u.name)} · ${u.is_admin ? 'Admin' : ROLE[u.role]}${u.status !== 'active' ? ' · awaiting payment' : ''}</option>`).join('')}</select>
    <button class="btn" id="demoReset" type="button">Reset</button></div>`;
  $('#demoAs').onchange = async e => { await API.setDemoUser(e.target.value); go(e.target.value ? 'hub' : 'home'); };
  $('#demoReset').onclick = () => { try { Object.keys(localStorage).filter(k => k.startsWith('sabha3_')).forEach(k => localStorage.removeItem(k)); } catch (e) {} Object.keys(mem).forEach(k => delete mem[k]); location.hash = ''; location.reload(); };
}

/* ============================================================ PUBLIC SITE */
const BRAND = esc(CONFIG.BRAND || 'Sabha');
const logoHTML = (h = 'home') => `<a class="logo" href="#${h}" aria-label="${BRAND} home">${BRAND}</a>`;
const MEGA = {
  hub: { title: 'Inside the <em>hub</em>', text: 'Everything a member uses, in one private place.', a: [['Deal room', 'For verified investors', 'hub-rail'], ['Opportunities', 'Partners, suppliers, buyers', 'hub-rail'], ['Introductions', 'By consent only', 'hub-rail']], b: [['Events', 'Pitch nights, dinners', 'hub-rail'], ['Directory', 'Verified members', 'hub-rail'], ['Membership desk', 'Human review', 'process']] },
  membership: { title: 'Small by <em>design</em>', text: 'Every application is read by a person.', a: [['Who it is for', '', 'who'], ['How it works', '', 'process'], ['Dues', '', 'dues']], b: [['Apply to join', '', '@apply'], ['Member sign in', '', '@login'], ['Questions', '', 'faq']] },
  company: { title: 'The <em>club</em>', text: 'A private network for people who build and back Indian businesses.', a: [['Our cities', '', 'cities'], ['Privacy', '', '@privacy'], ['Terms', '', '@terms']], b: [['Contact', esc(CONFIG.CONTACT_EMAIL || ''), 'faq']] }
};
const megaLink = ([t, s, target]) => `<li><a href="#${target.startsWith('@') ? target.slice(1) : 'home'}" ${target.startsWith('@') ? '' : `data-scroll="${target}"`}>${t}${s ? `<small>${s}</small>` : '<span class="arrow">→</span>'}</a></li>`;
function header(mode) {
  const cls = mode === 'hero' ? '' : 'light';
  return `<header class="hdr ${mode === 'solid' ? 'solid' : cls}" id="hdr"><div class="wrap">${logoHTML()}
    <nav class="mainnav" aria-label="Main">
      <button type="button" data-mega="hub" aria-expanded="false">The hub</button>
      <button type="button" data-mega="membership" aria-expanded="false">Membership</button>
      <button type="button" data-mega="company" aria-expanded="false">Company</button>
      ${ME && ME.access ? `<a class="btn s portal" href="#hub">Open the hub</a>` : `<a class="btn s portal" href="#home" data-portal>Portal</a>`}
    </nav></div>
    ${Object.keys(MEGA).map(k => `<div class="mega" id="mega-${k}"><div class="wrap"><div><h4>${MEGA[k].title}</h4><p>${MEGA[k].text}</p></div><ul>${MEGA[k].a.map(megaLink).join('')}</ul><ul>${MEGA[k].b.map(megaLink).join('')}</ul></div></div>`).join('')}
  </header>`;
}
function toggleMega(btn) {
  const k = btn.dataset.mega, el = document.getElementById('mega-' + k), open = !el.classList.contains('on');
  closeMega();
  if (open) { el.classList.add('on'); btn.setAttribute('aria-expanded', 'true'); $('#hdr').classList.add('solid'); }
}
function closeMega() { $$('.mega.on').forEach(m => m.classList.remove('on')); $$('[data-mega]').forEach(b => b.setAttribute('aria-expanded', 'false')); const h = $('#hdr'); if (h && h.dataset.mode !== 'solid' && window.scrollY < 40) h.classList.remove('solid'); }
function footer() {
  return `<footer class="ft"><div class="wrap"><div class="cols">
    <div>${logoHTML()}<p style="color:var(--onmu);margin-top:16px;max-width:300px;font-size:14px">${esc(CONFIG.TAGLINE || '')}</p>
      <div class="row" style="margin-top:24px;flex-wrap:wrap"><a class="btn white s" href="#login">Member sign in</a><a class="btn ghost s" href="#apply">Apply</a></div></div>
    <div><h5>The hub</h5><ul><li><a href="#home" data-scroll="hub-rail">Deal room</a></li><li><a href="#home" data-scroll="hub-rail">Opportunities</a></li><li><a href="#home" data-scroll="hub-rail">Events</a></li><li><a href="#home" data-scroll="hub-rail">Introductions</a></li></ul></div>
    <div><h5>Membership</h5><ul><li><a href="#home" data-scroll="who">Who it is for</a></li><li><a href="#home" data-scroll="process">How it works</a></li><li><a href="#home" data-scroll="dues">Dues</a></li><li><a href="#home" data-scroll="faq">Questions</a></li></ul></div>
    <div><h5>Company</h5><ul><li><a href="#privacy">Privacy policy</a></li><li><a href="#terms">Terms of membership</a></li><li>${esc(CONFIG.CONTACT_EMAIL || '')}</li></ul></div></div>
    <div class="legal"><span>© ${new Date().getFullYear()} ${BRAND}. By application only.</span><span>Contact details are never public. Introductions by consent.</span></div></div></footer>`;
}
function renderPublic(view, mode) {
  const pageMode = mode === true ? 'solid' : (mode || 'hero');
  $('#root').innerHTML = header(pageMode === 'hero' ? 'hero' : 'solid') + `<main id="pv"></main>` + footer() +
    (ME && ME.access ? '' : `<a class="btn float" href="#apply">Apply to join <span class="arrow">→</span></a>`);
  $('#hdr').dataset.mode = pageMode === 'hero' ? 'hero' : 'solid';
  view($('#pv'));
  reveal();
  const hdr = $('#hdr');
  const fl = $('.float');
  const onS = () => { if (hdr.dataset.mode === 'hero' && !$('.mega.on')) hdr.classList.toggle('solid', window.scrollY > 60); if (fl) fl.classList.toggle('show', hdr.dataset.mode !== 'hero' || window.scrollY > 700); };
  window.onscroll = onS; onS();
}
function reveal() {
  const els = $$('.rv');
  if (!('IntersectionObserver' in window)) return els.forEach(e => e.classList.add('in'));
  const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: .1 });
  els.forEach(e => io.observe(e));
}
function portalModal() {
  modal(`<button class="x" data-close aria-label="Close">×</button><h2>Access the <em>hub</em></h2><p class="sub">Choose how you would like to continue.</p>
    <div class="choices">
      <a class="primary" href="#login"><span class="ic">→</span>I'm a member — sign in</a>
      <a href="#apply" data-role="founder"><span class="ic">◆</span>I'm a founder — apply</a>
      <a href="#apply" data-role="business"><span class="ic">◇</span>I run a business — apply</a>
      <a href="#apply" data-role="investor"><span class="ic">○</span>I'm an investor — request an invitation</a>
    </div>`);
  $$('#modalBody [data-role]').forEach(a => a.addEventListener('click', () => { APPLY_ROLE = a.dataset.role; }));
}
let APPLY_ROLE = 'founder';

function viewHome(el) {
  const P = CONFIG.PRICES || {};
  const MODS = [['deals', 'Deal room', 'Founders share their round privately. Only verified investors see it, and they ask for the introduction.'],
    ['opps', 'Opportunities', 'Partnerships, suppliers, distributors and acquisitions, posted by people who run real businesses.'],
    ['intros', 'Introductions', 'Ask with context. Contact details are exchanged only when the other side says yes.'],
    ['events', 'Events', 'Pitch nights, owners’ dinners and closed-door roundtables, with limited seats.'],
    ['directory', 'Directory', 'A considered profile for every member: what you build, what you seek, what you offer.'],
    ['desk', 'Membership desk', 'Every member is checked by a person. GST or CIN, website and LinkedIn.']];
  const CITIES = [['Coimbatore', 11], ['Chennai', 23], ['Bengaluru', 31], ['Mumbai', 47], ['Delhi NCR', 53], ['Hyderabad', 61]];
  el.innerHTML = `
  <section class="hero">${bgArt('hero', skyline(7))}<div class="wrap">
    <div class="rv"><span class="eyebrow" style="color:#cfd6ee">By application · India</span>
      <h1 style="margin-top:22px">Where India's builders find their <em>backers</em></h1>
      <p>A private hub for verified founders, business owners and investors. No job seekers, no recruiters, no noise.</p></div>
    <div class="side rv"><div class="hcard"><b>Founding circle is open</b><span>${esc(P.founding?.note || 'Limited founding seats')} · ${esc(P.founding?.amt || '')} ${esc(P.founding?.per || '')}</span></div>
      <a class="btn white" href="#home" data-portal>Access the hub <span class="arrow">→</span></a></div>
  </div></section>

  <section class="sec statement"><div class="wrap rv"><span class="eyebrow">What we do</span>
    <h2>We're not another network. We're a <em>private hub</em> where people who <em>build</em> meet people who <em>back</em> them.</h2>
    <p>Deal flow, partners, suppliers and the right introduction, all in one place, reviewed by people and protected by design.</p>
    <div class="row" style="justify-content:center;margin-top:34px;flex-wrap:wrap"><a class="btn" href="#apply">Apply to join</a><a class="btn line" href="#home" data-scroll="hub-rail">Inside the hub</a></div></div></section>

  <section class="stats"><div class="wrap"><div class="grid">
    ${[['48h', 'Typical application review'], ['₹0', 'For verified investors'], ['100', 'Founding seats at ₹999 a month'], ['1:1', 'Introductions, both sides consent'], ['3', 'Member types: founders, owners, investors'], ['0', 'Job posts, recruiters or ads']]
      .map(s => `<div class="rv"><b>${s[0]}</b><span>${s[1]}</span></div>`).join('')}
  </div></div></section>

  <section class="sec" id="hub-rail"><div class="wrap">
    <div class="rail-head"><div class="rv"><h2 class="big">Inside the <em>hub</em></h2><p class="lead" style="margin-top:18px">Six rooms, one membership. Everything a member uses to find capital, partners and customers.</p></div>
      <div class="railbtns rv"><div class="progress"><i id="prog"></i></div><button type="button" id="rl" aria-label="Previous">←</button><button type="button" id="rr" aria-label="Next">→</button></div></div>
    <div class="rail" id="rail">${MODS.map(m => `<article class="card"><div class="art">${art(m[0])}</div><div class="txt"><h3>${m[1]}</h3><p>${m[2]}</p><a class="go" href="#home" data-portal>Explore <span class="arrow">→</span></a></div></article>`).join('')}</div>
  </div></section>

  <section class="sec" id="cities" style="background:var(--mist)"><div class="wrap cities">
    <div class="rv"><h2 class="big">Explore our <em>cities</em></h2><p class="lead" style="margin-top:18px">Members from across India, with dinners and pitch nights where they are.</p>
      <ul id="cityList">${CITIES.map((c, i) => `<li><button type="button" data-city="${i}" class="${i ? '' : 'on'}">${c[0]}<span class="arrow">→</span></button></li>`).join('')}</ul></div>
    <div class="view rv" id="cityView">${skyline(CITIES[0][1], { horizon: 700, sun: .3 })}<div class="cap">${CITIES[0][0]}</div></div>
  </div></section>

  <section class="sec" id="who"><div class="wrap split">
    <div class="rv"><span class="eyebrow">Membership</span><h2 class="big" style="margin-top:18px">Small by <em>design</em></h2></div>
    <p class="lead rv">Every application is read by a person. Being selective is the product, and it is why members return.</p></div>
    <div class="wrap grid g2" style="margin-top:60px">
      <div class="panel rv"><h3 class="t">Welcome</h3><ul class="rules"><li>Startup founders, pre-seed to growth</li><li>Business owners, MSMEs and family businesses</li><li>Angel investors, family offices and funds</li><li>Senior chartered accountants and counsel</li></ul></div>
      <div class="panel rv"><h3 class="t">Not for</h3><ul class="rules"><li>Job seekers and recruiters</li><li>Students</li><li>Mass promotion or MLM</li><li>Unverified or anonymous profiles</li></ul></div></div></section>

  <section class="sec" id="process" style="padding-top:0"><div class="wrap">
    <div class="rv"><span class="eyebrow">How it works</span><h2 class="big" style="margin-top:18px">From application to <em>first introduction</em></h2></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr));margin-top:56px;gap:0;border-top:1px solid var(--line)">
      ${[['01', 'Apply', 'Five minutes: your business, your role and what you are looking for.'], ['02', 'Verification', 'We check GST or CIN, your website and LinkedIn, usually within 48 hours.'],
         ['03', 'Activation', 'Founders and owners choose a plan. Verified investors join as our guests.'], ['04', 'Introductions', 'Share a need or a round, join an event and request warm introductions.']]
        .map(s => `<div class="rv" style="padding:30px 30px 0 0"><span class="eyebrow" style="color:var(--navy)">${s[0]}</span><h3 style="font-size:28px;margin:14px 0 10px">${s[1]}</h3><p class="mu sm">${s[2]}</p></div>`).join('')}
    </div></div></section>

  <section class="sec" id="dues" style="background:var(--mist)"><div class="wrap">
    <div class="split" style="margin-bottom:50px"><div class="rv"><span class="eyebrow">Dues</span><h2 class="big" style="margin-top:18px">Priced like a <em>serious</em> club</h2></div>
    <p class="lead rv">Billed only after approval. Cancel whenever you like. Prices exclude GST.</p></div>
    <div class="tiers rv">
      ${tier(P.founding, ['Everything a founder receives', 'Your rate, locked for life', 'Founding mark on your profile'], true)}
      ${tier(P.founder, ['Share rounds in the deal room', 'Unlimited introduction requests', 'Events and directory'])}
      ${tier(P.business, ['Opportunities and directory', 'Unlimited introduction requests', 'Owners’ dinners'])}
      ${tier(P.investor, ['Every round in the deal room', 'Introductions to founders', 'Pitch night seats'])}
    </div></div></section>

  <section class="sec" id="faq"><div class="wrap split" style="align-items:start">
    <div class="rv"><span class="eyebrow">Questions</span><h2 class="big" style="margin-top:18px">Before you <em>apply</em></h2></div>
    <div class="faq rv">
      ${[['Why is membership paid?', 'Free networks fill up with spam and job seekers. Paid, verified membership keeps the hub useful for everyone in it.'],
         ['How are members verified?', 'We check business registration (GST or CIN) or the company website, and LinkedIn. Investors are checked for past investments or a fund or family office.'],
         ['Do investors pay?', 'No. Verified investors join as guests, because founders join to meet them.'],
         ['Who can see my contact details?', 'No one, until you accept an introduction. Your email and phone are never shown on your profile, and are hidden again if a membership lapses.'],
         ['How is my data protected?', 'Every permission is enforced by the database itself, not only the screen. Contact details, billing and admin records are stored separately and locked to the people entitled to them. See our privacy policy.']]
        .map(q => `<details><summary>${q[0]}</summary><p>${q[1]}</p></details>`).join('')}
    </div></div></section>

  <section class="cta">${bgArt('cta', lines(5))}<div class="wrap rv"><span class="eyebrow" style="color:var(--onmu)">By application</span>
    <h2 style="margin-top:20px">Your next partner, customer or investor is <em>one introduction</em> away</h2>
    <div class="row" style="justify-content:center;flex-wrap:wrap"><a class="btn white" href="#apply">Apply to join</a><a class="btn ghost" href="#login">Member sign in</a></div></div></section>`;
  const rail = $('#rail'), prog = $('#prog');
  const upd = () => { const max = rail.scrollWidth - rail.clientWidth; const w = Math.max(.2, rail.clientWidth / rail.scrollWidth); prog.style.width = (w * 100) + '%'; prog.style.left = (max ? (rail.scrollLeft / max) * (1 - w) * 100 : 0) + '%'; };
  rail.addEventListener('scroll', upd, { passive: true }); upd();
  $('#rl').onclick = () => rail.scrollBy({ left: -340, behavior: 'smooth' });
  $('#rr').onclick = () => rail.scrollBy({ left: 340, behavior: 'smooth' });
  $$('[data-city]').forEach(b => b.onclick = () => { const c = CITIES[+b.dataset.city]; $$('[data-city]').forEach(x => x.classList.toggle('on', x === b)); $('#cityView').innerHTML = skyline(c[1], { horizon: 700, sun: .3 + (+b.dataset.city) * .08 }) + `<div class="cap">${c[0]}</div>`; });
}
function tier(p, items, feat) {
  if (!p) return '';
  return `<div class="tier ${feat ? 'feat' : ''}"><span class="eyebrow" style="${feat ? 'color:var(--onmu)' : ''}">${esc(p.label)}</span><div class="amt">${esc(p.amt)}</div><div class="per">${esc(p.per)}</div>
    ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul><a class="btn ${feat ? 'white' : 'line'}" href="#apply">Apply</a></div>`;
}
const pageHero = (eye, title, sub, seed = 13) => `<section class="page-hero"><div class="bg">${lines(seed)}</div><div class="wrap"><span class="eyebrow" style="color:var(--onmu)">${eye}</span><h1 style="margin-top:18px">${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div></section>`;

function viewApply(el) {
  let role = APPLY_ROLE;
  const draw = () => {
    el.innerHTML = pageHero('Membership application', 'Request an <em>invitation</em>', 'About five minutes. Every application is read by a person, usually within 48 hours.') + `<div class="wrap page"><div class="apply">
      <div class="side"><ol><li>Tell us about you and your business</li><li>We verify registration and LinkedIn</li><li>You receive a private sign-in link</li><li>Activate and enter the hub</li></ol>
        <p class="xs di" style="margin-top:22px">Your details are used only to review your application. They are never shown publicly or sold. <a href="#privacy" style="text-decoration:underline">Privacy policy</a>.</p></div>
      <form id="af" class="formcard" autocomplete="on" novalidate>
        <div class="roles" role="radiogroup" aria-label="I am a">${Object.keys(ROLE).map(r => `<button type="button" role="radio" aria-checked="${r === role}" data-r="${r}" class="${r === role ? 'on' : ''}">${ROLE[r]}</button>`).join('')}</div>
        <div class="fg">
          <label class="f"><span>Full name</span><input name="name" required minlength="2" maxlength="80" autocomplete="name"></label>
          <label class="f"><span>Work email</span><input name="email" type="email" required maxlength="120" autocomplete="email"></label>
          <label class="f"><span>${role === 'investor' ? 'Fund, family office or "Angel"' : 'Company'}</span><input name="company" required maxlength="100" autocomplete="organization"></label>
          <label class="f"><span>City</span><input name="city" required maxlength="60" autocomplete="address-level2"></label>
          <label class="f"><span>Website</span><input name="website" maxlength="200" placeholder="yourcompany.in" inputmode="url"></label>
          <label class="f"><span>LinkedIn</span><input name="linkedin" required maxlength="200" placeholder="linkedin.com/in/…" inputmode="url"></label>
          ${role !== 'investor' ? `<label class="f"><span>GST or CIN</span><input name="gst_cin" maxlength="30" placeholder="Speeds up verification"></label>
          <label class="f"><span>Industry</span><select name="industry">${opts(INDUSTRIES)}</select></label>
          <label class="f"><span>Annual revenue</span><select name="revenue_band">${opts(REVENUE)}</select></label>
          <label class="f"><span>Stage</span><select name="stage">${opts(STAGES)}</select></label>`
          : `<label class="f" style="grid-column:1/-1"><span>Focus sector</span><select name="industry">${opts(INDUSTRIES)}</select></label>`}
        </div>
        <label class="f"><span>${role === 'investor' ? 'Typical cheque size and past investments' : 'What are you looking for here?'}</span><textarea name="seeking" required minlength="10" maxlength="600"></textarea></label>
        <div class="fg"><label class="f"><span>Phone, for the verification call</span><input name="phone" maxlength="20" inputmode="tel" autocomplete="tel"></label>
          <label class="f"><span>How did you hear of us?</span><input name="referral" maxlength="100"></label></div>
        <label class="check"><input type="checkbox" name="consent" value="yes" required><span>I agree that ${BRAND} may use these details to verify my application, as described in the <a href="#privacy" style="text-decoration:underline">privacy policy</a>.</span></label>
        <input class="hp" name="company_url" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button class="btn" style="width:100%" type="submit">Submit application <span class="arrow">→</span></button>
      </form></div></div>`;
    $$('[data-r]').forEach(b => b.onclick = () => { role = APPLY_ROLE = b.dataset.r; draw(); });
    $('#af').onsubmit = async e => {
      e.preventDefault(); const f = formData(e.target);
      if (f.company_url) return; delete f.company_url;
      if (f.consent !== 'yes') return toast('Please agree to the privacy policy to continue.'); delete f.consent;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return toast('Please enter a valid email.');
      for (const k of ['name', 'company', 'city', 'linkedin']) if (!f[k]) return toast('Please complete all the required fields.');
      if (f.seeking.length < 10) return toast('Tell us a little more about what you are looking for.');
      f.website = normUrl(f.website); f.linkedin = normUrl(f.linkedin);
      if (!f.linkedin) return toast('Please enter a valid LinkedIn link.');
      const btn = e.target.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Submitting…';
      try {
        await API.apply({ ...f, role, email: f.email.toLowerCase() });
        el.innerHTML = pageHero('Received', `Thank you, ${first(f.name)}`, `We read every application by hand and usually reply within 48 hours at ${esc(f.email)}.`) + `<div class="wrap page"><a class="btn line" href="#home">Return home</a></div>`;
      } catch (err) { btn.disabled = false; btn.textContent = 'Submit application'; toast(errMsg(err)); }
    };
  };
  draw();
}
async function viewLogin(el) {
  if (DEMO) {
    const users = await API.demoUsers();
    el.innerHTML = pageHero('Member portal', 'Choose a <em>demo</em> member', 'In the live hub, members get a one-time sign-in link by email. There are no passwords to steal.') +
      `<div class="wrap page"><div class="grid g3">${users.map(u => `<div class="mem" data-u="${esc(u.id)}" tabindex="0"><div class="row">${avatar(u)}<div><b>${esc(u.name)}</b><div class="xs mu">${u.is_admin ? 'Admin' : ROLE[u.role]}${u.status !== 'active' ? ' · awaiting payment' : ''}</div></div></div></div>`).join('')}</div></div>`;
    $$('[data-u]').forEach(c => c.onclick = async () => { await API.setDemoUser(c.dataset.u); go('hub'); });
    return;
  }
  el.innerHTML = pageHero('Member portal', 'Welcome <em>back</em>', 'Enter the email you applied with. We will send a private, one-time sign-in link.') + `<div class="wrap page" style="max-width:560px">
    <form id="lf" class="formcard" novalidate><label class="f"><span>Email</span><input type="email" name="email" required autocomplete="email"></label><button class="btn" style="width:100%" type="submit">Send sign-in link</button></form>
    <p class="sm mu" style="margin-top:18px">Not yet a member? <a href="#apply" style="text-decoration:underline">Request an invitation</a>.</p></div>`;
  let last = 0;
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const email = formData(e.target).email.toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Please enter a valid email.');
    if (Date.now() - last < 60000) return toast('Please wait a minute before requesting another link.');
    last = Date.now(); e.target.querySelector('button').disabled = true;
    try { await API.signIn(email); } catch (err) { /* same answer either way: never reveal whether an email is a member */ }
    e.target.innerHTML = `<p class="mu">If <b>${esc(email)}</b> belongs to a member, a sign-in link is on its way. You can close this tab.</p>`;
  };
}
const solo = (mark, title, body, actions) => pageHero('Member portal', title, body) + `<div class="wrap page"><div class="row" style="flex-wrap:wrap">${actions}</div></div>`;
function viewNotMember(el) { el.innerHTML = solo('◌', 'No membership for this <em>email</em>', `${esc(ME.email)} is signed in but has not been approved. If you applied, we will write after review.`, `<a class="btn" href="#apply">Apply</a><button class="btn line" data-signout type="button">Sign out</button>`); }
function viewSuspended(el) { el.innerHTML = solo('∥', 'Your membership is <em>paused</em>', `Questions? Write to ${esc(CONFIG.CONTACT_EMAIL)}.`, `<button class="btn line" data-signout type="button">Sign out</button>`); }
function viewRenew(el) { el.innerHTML = solo('◷', 'Your membership has <em>lapsed</em>', 'Renew to return to the deal room, your introductions and events. Your profile is hidden until then.', payButtons() + `<button class="btn line" data-signout type="button">Sign out</button>`); }
function payButtons() {
  const L = CONFIG.PAYMENT_LINKS || {}, biz = ME && ME.role === 'business';
  const b = (k, t, cls = '') => safeUrl(L[k]) ? `<a class="btn ${cls}" href="${esc(safeUrl(L[k]))}" target="_blank" rel="noopener noreferrer">${t}</a>` : '';
  return (b('founding', 'Founding · ' + CONFIG.PRICES.founding.amt) + b(biz ? 'business_month' : 'founder_month', 'Pay monthly', 'line') + b(biz ? 'business_year' : 'founder_year', 'Pay yearly', 'line')) || `<span class="mu sm">Your payment link will arrive by email.</span>`;
}
function viewPaywall(el) {
  const P = CONFIG.PRICES, t = ME.role === 'business' ? P.business : P.founder;
  el.innerHTML = pageHero('You are approved', `Welcome, ${first(ME.name)}. <em>One step remains.</em>`, 'Activate your membership to enter the hub. We confirm your account within a few hours of payment.') +
    `<div class="wrap page"><div class="tiers" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));max-width:820px">${tier(P.founding, ['Your rate, locked for life', 'Founding mark on your profile'], true)}${tier(t, ['Full access to the hub', 'Cancel whenever you like'])}</div>
    <div class="row" style="margin-top:28px;flex-wrap:wrap">${payButtons()}</div><p class="xs di" style="margin-top:18px">Prices exclude GST · ${esc(CONFIG.CONTACT_EMAIL)}</p></div>`;
  $$('#pv .tier .btn').forEach(a => a.remove());
}
function viewPrivacy(el) {
  el.innerHTML = pageHero('Legal', 'Privacy <em>policy</em>', 'How we collect, use and protect your information.') + `<div class="wrap page"><div class="legaltext">
    <p><b>Template:</b> adapt this policy to your business and have it reviewed by a lawyer before launch. It is written with India's Digital Personal Data Protection Act, 2023 in mind.</p>
    <h2>What we collect</h2><ul><li>Application details: name, work email, phone, company, city, website, LinkedIn, GST or CIN, industry, revenue band, stage and what you are looking for.</li><li>Member content: your profile, posts, rounds, introduction requests and event RSVPs.</li><li>Payment records: plan and the date your membership is paid until. Card and bank details are handled by our payment provider, not by us.</li></ul>
    <h2>Why we use it</h2><ul><li>To verify applications and decide on membership.</li><li>To run the hub: show your profile to other paid-up members, deliver introductions you accept, and manage events.</li><li>To contact you about your membership.</li></ul><p>We do not sell your data or show you advertising.</p>
    <h2>Who can see it</h2><ul><li>Your email and phone are visible only to you, our membership desk, and members whose introduction request you accept.</li><li>Your profile is visible only to approved, paid-up members. It is hidden if your membership lapses.</li><li>Rounds in the deal room are visible only to verified investors and to you.</li></ul>
    <h2>Your rights</h2><p>You may ask to see, correct or delete your data, or withdraw consent, by writing to ${esc(CONFIG.CONTACT_EMAIL)}. We respond within 30 days.</p>
    <h2>Retention and security</h2><p>We keep application data for up to 12 months after a decision, and member data while you are a member and for up to 12 months after. Data is stored with our database provider, protected by row-level security, encryption in transit and access limited to the people entitled to it.</p>
    <h2>Grievance officer</h2><p>${esc(CONFIG.GRIEVANCE_OFFICER || 'Name of grievance officer')}, ${esc(CONFIG.CONTACT_EMAIL)}.</p></div></div>`;
}
function viewTerms(el) {
  el.innerHTML = pageHero('Legal', 'Terms of <em>membership</em>', 'The house rules that keep the hub useful.') + `<div class="wrap page"><div class="legaltext">
    <p><b>Template:</b> adapt to your business and have it reviewed by a lawyer before launch.</p>
    <h2>Membership</h2><p>Membership is by application and at our discretion. You must give accurate information about yourself and your business.</p>
    <h2>Dues</h2><p>Dues are billed after approval for the plan you choose and exclude GST. Access ends automatically on the date your membership is paid until unless renewed.</p>
    <h2>Conduct</h2><ul><li>Post real business needs only. No hiring posts, mass promotion or MLM.</li><li>Request introductions with a clear, specific reason, and respect a decline.</li><li>Keep what you learn in the deal room and at events confidential.</li><li>Do not copy, scrape or export member information.</li></ul>
    <h2>No investment advice</h2><p>${BRAND} does not give investment advice, does not verify every claim in a member's profile or round, and is not a party to any deal. Do your own due diligence.</p>
    <h2>Ending membership</h2><p>You can cancel at any time. We may suspend members who break these terms.</p></div></div>`;
}

/* ============================================================ THE HUB (members area) */
async function renderHub(view) {
  const intros = await API.listIntros().catch(() => []);
  const pending = intros.filter(i => i.to_id === ME.id && i.status === 'pending').length;
  const nav = [['hub', 'Hub'], ['feed', 'Opportunities'], ['deals', 'Deal room'], ['events', 'Events'], ['members', 'Directory'], ['intros', 'Introductions']];
  const you = [['profile', 'My profile']]; if (ME.is_admin) you.push(['admin', 'Membership desk']);
  const ICONK = { feed: 'feed', deals: 'deals', events: 'events', members: 'members', intros: 'intros', profile: 'profile', admin: 'admin', hub: 'hub' };
  const cur = view === 'member' ? 'members' : view;
  const badge = k => k === 'intros' && pending ? `<span class="n">${pending}</span>` : '';
  const it = ([k, l]) => `<a class="nv ${cur === k ? 'on' : ''}" href="#${k}">${ICON[ICONK[k]]}${l}${badge(k)}</a>`;
  const tabs = [['hub', 'Hub'], ['feed', 'Board'], ['deals', 'Deals'], ['events', 'Events'], ['intros', 'Intros']];
  window.onscroll = null;
  $('#root').innerHTML = `<div class="hub">
    <aside class="rail-nav">${logoHTML('hub')}<div class="lbl">The hub</div>${nav.map(it).join('')}<div class="lbl">You</div>${you.map(it).join('')}
      <div class="me">${avatar(ME, 's')}<div class="nm">${esc(ME.name)}<small>${ME.is_admin ? 'Admin' : ROLE[ME.role]}${ME.plan === 'founding' ? ' · Founding' : ''}</small></div>${DEMO ? '' : '<button data-signout type="button">Sign out</button>'}</div></aside>
    <div><div class="topbar">${logoHTML('hub')}<a href="#profile" aria-label="My profile">${avatar(ME, 's')}</a></div>
      <main class="content" id="av"><div class="empty">Loading…</div></main></div>
    <nav class="tabbar" style="--cols:5">${tabs.map(([k, l]) => `<a class="${cur === k ? 'on' : ''}" href="#${k}">${ICON[ICONK[k]]}${l}${badge(k)}</a>`).join('')}</nav>
  </div>`;
  const el = $('#av');
  try { await ({ hub: x => appHub(x, intros), feed: appFeed, deals: appDeals, events: appEvents, members: appMembers, intros: x => appIntros(x, intros), profile: appProfile, admin: appAdmin, member: appMember })[view](el); }
  catch (err) { el.innerHTML = `<div class="empty"><h3>Something went wrong</h3><p>${esc(errMsg(err))}</p></div>`; }
}
const head = (eye, title, sub, right = '') => `<div class="head"><div><span class="eyebrow">${eye}</span><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div>`;
const byline = m => m ? `<div class="row by" data-show="${esc(m.id)}">${avatar(m, 's')}<div><b>${esc(m.name)}</b> <span class="pill ${m.role === 'investor' ? 'n' : ''}" style="margin-left:6px">${ROLE[m.role] || ''}</span><div class="xs mu">${esc(m.company || '')}${m.city ? ' · ' + esc(m.city) : ''}</div></div></div>`
  : `<div class="row">${avatar({ name: '·' }, 's')}<div class="xs mu">Former member</div></div>`;
const dayBox = d => { const x = new Date(d); return `<div class="date"><b>${x.getDate()}</b><small>${x.toLocaleString('en-IN', { month: 'short' })}</small></div>`; };
const when = d => new Date(d).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

async function appHub(el, intros) {
  const [posts, deals, events, members, mine] = await Promise.all([API.listPosts().catch(() => []), API.listDeals().catch(() => []), API.listEvents().catch(() => []), API.listMembers().catch(() => []), API.getMember(ME.id).catch(() => ME)]);
  const fields = ['headline', 'bio', 'seeking', 'offering', 'city', 'website', 'linkedin', 'traction'];
  const done = Math.round(100 * fields.filter(f => mine && mine[f]).length / fields.length);
  const upcoming = events.filter(e => new Date(e.starts_at) > new Date());
  const weekPosts = posts.filter(p => Date.now() - new Date(p.created_at) < 7 * 86400000).length;
  const waiting = intros.filter(i => i.to_id === ME.id && i.status === 'pending');
  const inv = ME.role === 'investor' || ME.is_admin;
  const T = (k, ic, title, line, btn, target) => `<div class="tile"><div class="ic">${ICON[ic]}</div><h3>${title}</h3><div class="k">${line}</div><a class="btn s ${k ? '' : 'line'}" href="#${target}">${btn} <span class="arrow">→</span></a></div>`;
  el.innerHTML = `<section class="welcome"><div class="bg">${lines(9)}</div><span class="eyebrow">${greet()}</span><h1>Welcome to the <em>hub</em>, ${first(ME.name)}</h1>
      <p>${waiting.length ? `${waiting.length} introduction${waiting.length > 1 ? 's are' : ' is'} waiting for your answer.` : 'Here is what is happening across the club today.'}</p>
      <div class="acts"><a class="btn white s" href="#feed">Post an opportunity</a>${ME.role === 'founder' || ME.role === 'business' ? `<a class="btn ghost s" href="#deals">Share a round</a>` : `<a class="btn ghost s" href="#deals">Review rounds</a>`}<a class="btn ghost s" href="#members">Find a member</a></div></section>
    <div class="tiles">
      ${T(1, 'deals', 'Deal room', inv ? `${deals.length} open round${deals.length === 1 ? '' : 's'} for investors` : `${deals.length} of your rounds shared with investors`, inv ? 'Review rounds' : 'Your rounds', 'deals')}
      ${T(1, 'feed', 'Opportunities', `${weekPosts} new this week · ${posts.length} open`, 'Open board', 'feed')}
      ${T(1, 'intros', 'Introductions', waiting.length ? `${waiting.length} awaiting your answer` : 'Nothing waiting for you', 'Open', 'intros')}
      ${T(0, 'events', 'Events', upcoming[0] ? `Next: ${esc(upcoming[0].title.slice(0, 38))}` : 'No upcoming events', 'See events', 'events')}
      ${T(0, 'members', 'Directory', `${members.length} verified members`, 'Browse', 'members')}
      <div class="tile"><div class="ic">${ICON.profile}</div><h3>Your profile</h3><div class="k">${done}% complete${done < 100 ? ' · complete profiles get more intros' : ''}</div><div class="meter"><i style="width:${done}%"></i></div><a class="btn s line" href="#profile">Edit profile <span class="arrow">→</span></a></div>
    </div>
    <div class="two">
      <div class="panel"><h3 class="t">Latest on the board <a class="sm" href="#feed" style="color:var(--navy)">View all →</a></h3><div class="list">
        ${posts.slice(0, 4).map(p => `<div class="li">${avatar(p.author || { name: '·' }, 's')}<div class="grow"><b>${esc(p.title)}</b><span class="xs mu">${esc(p.type)} · ${esc(p.author?.name || 'Former member')} · ${ago(p.created_at)}</span></div></div>`).join('') || '<p class="mu sm">No posts yet.</p>'}</div></div>
      <div class="panel"><h3 class="t">Upcoming <a class="sm" href="#events" style="color:var(--navy)">All events →</a></h3><div class="list">
        ${upcoming.slice(0, 3).map(e => `<div class="li">${dayBox(e.starts_at)}<div class="grow"><b>${esc(e.title)}</b><span class="xs mu">${esc(e.kind)} · ${esc(e.city || '')} · ${e.going}/${e.seats} going</span></div>${e.mine ? '<span class="pill ok">Going</span>' : ''}</div>`).join('') || '<p class="mu sm">No upcoming events.</p>'}</div></div>
    </div>`;
}

async function appFeed(el) {
  const posts = await API.listPosts(); let filter = 'All';
  const draw = () => {
    const list = posts.filter(p => filter === 'All' || p.type === filter);
    el.innerHTML = head('Opportunities', 'What members <em>need</em>', 'Real business needs from verified members. Reply with an introduction request.', `<button class="btn" id="np" type="button">Post an opportunity</button>`) +
      `<div class="chips">${['All', ...POST_TYPES].map(t => `<button type="button" data-f="${esc(t)}" class="${t === filter ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>
      <div class="cols"><div>${list.map(p => `<article class="item"><div class="meta">${byline(p.author)}<span class="when">${ago(p.created_at)}</span></div>
        <span class="pill n">${esc(p.type)}</span><h3>${esc(p.title)}</h3><div class="body">${esc(p.body)}</div>
        <div class="foot">${p.author_id !== ME.id ? (p.author ? `<button class="btn s" data-int="${esc(p.id)}" type="button">I'm interested</button>` : '') : `<span class="xs mu">Your post</span>`}
        ${p.author_id === ME.id || ME.is_admin ? `<button class="btn s bad" data-del="${esc(p.id)}" type="button">Remove</button>` : ''}</div></article>`).join('')
        || `<div class="empty"><h3>Nothing here yet</h3><p>Be the first to post.</p></div>`}</div>
      <aside><div class="panel"><h3 class="t">House rules</h3><ul class="rules"><li>Real business needs only</li><li>No hiring or job posts</li><li>No mass promotion</li><li>Introductions only with consent</li><li>Five posts a day at most</li></ul></div></aside></div>`;
    $$('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; draw(); });
    $('#np').onclick = () => {
      modal(`<button class="x" data-close aria-label="Close">×</button><h2>Post an <em>opportunity</em></h2><p class="sub">Visible to verified members only.</p><form id="pfm" novalidate><label class="f"><span>Type</span><select name="type">${opts(POST_TYPES)}</select></label>
        <label class="f"><span>Headline</span><input name="title" required minlength="3" maxlength="120" placeholder="e.g. A distributor in Gujarat"></label>
        <label class="f"><span>Details</span><textarea name="body" required minlength="3" maxlength="1500"></textarea></label>
        <div class="actions"><button type="button" class="btn line" data-close>Cancel</button><button class="btn" type="submit">Post</button></div></form>`);
      $('#pfm').onsubmit = async e => { e.preventDefault(); const f = formData(e.target); if (f.title.length < 3 || f.body.length < 3) return toast('Please add a headline and details.');
        try { await API.createPost(f); toast('Posted'); go('feed'); } catch (err) { toast(errMsg(err)); } };
    };
    $$('[data-int]').forEach(b => b.onclick = () => { const p = posts.find(x => x.id === b.dataset.int); if (p && p.author) introModal(p.author, 'Opportunity · ' + p.title); });
    $$('[data-del]').forEach(b => b.onclick = () => confirmBox('Remove this post?', async () => { await API.deletePost(b.dataset.del); toast('Removed'); go('feed'); }));
  };
  draw();
}
function confirmBox(q, fn) {
  modal(`<h2>${esc(q)}</h2><p class="sub">This cannot be undone.</p><div class="actions"><button class="btn line" data-close type="button">Keep</button><button class="btn bad" id="cy" type="button">Remove</button></div>`);
  $('#cy').onclick = async () => { try { await fn(); } catch (e) { toast(errMsg(e)); } closeModal(); };
}
function introModal(m, context) {
  modal(`<button class="x" data-close aria-label="Close">×</button><h2>Meet ${esc(m.name)}</h2><p class="sub">${esc(context)}</p>
    <form id="ifm" novalidate><label class="f"><span>Why would you like to meet?</span><textarea name="message" required minlength="10" maxlength="600" placeholder="Be specific. Clear, relevant requests are accepted."></textarea></label>
    <p class="xs mu" style="margin-bottom:20px">${first(m.name)} sees your profile and this note. Contact details are shared only if they accept.</p>
    <div class="actions"><button type="button" class="btn line" data-close>Cancel</button><button class="btn" type="submit">Send request</button></div></form>`);
  $('#ifm').onsubmit = async e => {
    e.preventDefault(); const msg = formData(e.target).message;
    if (msg.length < 10) return toast('Add a short note (at least 10 characters).');
    try { await API.requestIntro(m.id, String(context).slice(0, 200), msg); closeModal(); toast('Request sent'); } catch (err) { toast(errMsg(err)); }
  };
}

async function appDeals(el) {
  const deals = await API.listDeals();
  const canPost = ME.role === 'founder' || ME.role === 'business', inv = ME.role === 'investor' || ME.is_admin;
  el.innerHTML = head('Deal room', inv ? 'Open <em>rounds</em>' : 'Your <em>rounds</em>', inv ? 'Visible only to verified investors and the founders who shared them.' : 'Only verified investors can see your round. Other founders never can.',
      canPost ? `<button class="btn" id="nd" type="button">Share a round</button>` : '') +
    (deals.map(d => `<article class="item deal"><div class="meta">${byline(d.founder)}<span class="when">${ago(d.created_at)}</span></div>
      <div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:wrap"><div><h3 style="margin-top:0">${esc(d.company)}</h3><div class="row" style="gap:8px"><span class="pill n">${esc(d.stage)}</span><span class="pill">${esc(d.sector)}</span></div></div>
      <div class="fig"><div class="xs mu">Raising</div><div class="amt">${esc(d.raising)}</div>${d.valuation ? `<div class="xs mu" style="margin-top:6px">${esc(d.valuation)}</div>` : ''}</div></div>
      <div class="body" style="margin-top:18px">${esc(d.summary)}</div>
      <div class="foot">${safeUrl(d.deck_url) ? `<a class="btn s line" href="${esc(safeUrl(d.deck_url))}" target="_blank" rel="noopener noreferrer nofollow">View deck</a>` : ''}
        ${ME.role === 'investor' && d.founder_id !== ME.id && d.founder ? `<button class="btn s" data-ri="${esc(d.id)}" type="button">Request introduction</button>` : ''}
        ${d.founder_id === ME.id || ME.is_admin ? `<button class="btn s bad" data-dd="${esc(d.id)}" type="button">Remove</button>` : ''}</div></article>`).join('')
    || `<div class="empty"><h3>${inv ? 'No open rounds yet' : 'No rounds shared yet'}</h3><p>${canPost ? 'Share your round and verified investors will see it.' : 'Rounds appear here as founders share them.'}</p></div>`);
  $$('[data-ri]').forEach(b => b.onclick = () => { const d = deals.find(x => x.id === b.dataset.ri); if (d) introModal(d.founder, 'Round · ' + d.company); });
  $$('[data-dd]').forEach(b => b.onclick = () => confirmBox('Remove this round?', async () => { await API.deleteDeal(b.dataset.dd); toast('Removed'); go('deals'); }));
  if (canPost) $('#nd').onclick = () => {
    modal(`<button class="x" data-close aria-label="Close">×</button><h2>Share a <em>round</em></h2><p class="sub">Private to verified investors.</p><form id="dfm" novalidate><div class="fg">
      <label class="f"><span>Company</span><input name="company" required maxlength="100" value="${esc(ME.company)}"></label>
      <label class="f"><span>Sector</span><select name="sector">${opts(INDUSTRIES, ME.industry)}</select></label>
      <label class="f"><span>Stage</span><select name="stage">${opts(STAGES, ME.stage)}</select></label>
      <label class="f"><span>Raising</span><input name="raising" required maxlength="40" placeholder="₹3 crore"></label></div>
      <label class="f"><span>Valuation (optional)</span><input name="valuation" maxlength="60" placeholder="Open to discussion"></label>
      <label class="f"><span>Problem, traction, use of funds</span><textarea name="summary" required minlength="10" maxlength="1500"></textarea></label>
      <label class="f"><span>Deck link (Google Drive, DocSend)</span><input name="deck_url" maxlength="300" inputmode="url" placeholder="https://"></label>
      <div class="actions"><button type="button" class="btn line" data-close>Cancel</button><button class="btn" type="submit">Share with investors</button></div></form>`);
    $('#dfm').onsubmit = async e => {
      e.preventDefault(); const f = formData(e.target);
      if (!f.company || !f.raising || f.summary.length < 10) return toast('Please complete company, amount and summary.');
      if (f.deck_url && !normUrl(f.deck_url)) return toast('Please enter a valid deck link.'); f.deck_url = normUrl(f.deck_url);
      try { await API.createDeal(f); toast('Shared with verified investors'); go('deals'); } catch (err) { toast(errMsg(err)); }
    };
  };
}

async function appEvents(el) {
  const events = await API.listEvents(); const now = new Date();
  const up = events.filter(e => new Date(e.starts_at) > now), past = events.filter(e => new Date(e.starts_at) <= now);
  const card = e => { const full = e.going >= e.seats, open = new Date(e.starts_at) > now;
    return `<article class="item"><div class="row" style="align-items:flex-start;gap:18px">${dayBox(e.starts_at)}<div style="flex:1;min-width:0">
      <div class="row" style="gap:8px;flex-wrap:wrap"><span class="pill n">${esc(e.kind)}</span><span class="pill">${esc(e.city || '')}</span>${e.mine ? '<span class="pill ok">You are going</span>' : ''}${full && !e.mine ? '<span class="pill bad">Full</span>' : ''}</div>
      <h3>${esc(e.title)}</h3><div class="xs mu">${when(e.starts_at)} · ${esc(e.venue || '')}</div><div class="body" style="margin-top:12px">${esc(e.description || '')}</div>
      <div class="foot"><span class="sm mu">${e.going} of ${e.seats} seats taken</span>
        ${open ? (e.mine ? `<button class="btn s line" data-cx="${esc(e.id)}" type="button">Cancel my seat</button>${safeUrl(e.join_url) ? `<a class="btn s" href="${esc(safeUrl(e.join_url))}" target="_blank" rel="noopener noreferrer">Join online</a>` : ''}`
          : (full ? '' : `<button class="btn s" data-rs="${esc(e.id)}" type="button">Reserve a seat</button>`)) : '<span class="pill">Past</span>'}
        ${ME.is_admin ? `<button class="btn s bad" data-de="${esc(e.id)}" type="button">Delete</button>` : ''}</div>
      ${e.guests && e.guests.length ? `<div class="row" style="margin-top:16px;gap:6px;flex-wrap:wrap">${e.guests.slice(0, 8).map(g => `<span data-show="${esc(g.id)}" title="${esc(g.name)}" style="cursor:pointer">${avatar(g, 's')}</span>`).join('')}${e.guests.length > 8 ? `<span class="xs mu">+${e.guests.length - 8}</span>` : ''}</div>` : ''}
    </div></div></article>`; };
  el.innerHTML = head('Events', 'In the <em>room</em>', 'Pitch nights, owners’ dinners and roundtables for members. Seats are limited.', ME.is_admin ? `<button class="btn" id="ne" type="button">Create event</button>` : '') +
    (up.map(card).join('') || `<div class="empty"><h3>No upcoming events</h3><p>New events are announced here first.</p></div>`) +
    (past.length ? `<h3 style="font-size:22px;margin:36px 0 14px">Past events</h3>${past.slice(-5).reverse().map(card).join('')}` : '');
  $$('[data-rs]').forEach(b => b.onclick = async () => { try { await API.rsvp(b.dataset.rs); toast('Seat reserved'); go('events'); } catch (e) { toast(errMsg(e)); } });
  $$('[data-cx]').forEach(b => b.onclick = async () => { try { await API.cancelRsvp(b.dataset.cx); toast('Seat released'); go('events'); } catch (e) { toast(errMsg(e)); } });
  $$('[data-de]').forEach(b => b.onclick = () => confirmBox('Delete this event?', async () => { await API.deleteEvent(b.dataset.de); toast('Deleted'); go('events'); }));
  if (ME.is_admin) $('#ne').onclick = () => {
    modal(`<button class="x" data-close aria-label="Close">×</button><h2>Create an <em>event</em></h2><p class="sub">Visible to paid-up members only.</p><form id="efm" novalidate>
      <label class="f"><span>Title</span><input name="title" required maxlength="120"></label>
      <div class="fg"><label class="f"><span>Type</span><select name="kind">${opts(['Pitch night', 'Roundtable', 'Dinner', 'Online session', 'Site visit'])}</select></label>
      <label class="f"><span>Date and time</span><input name="starts_at" type="datetime-local" required></label>
      <label class="f"><span>City</span><input name="city" maxlength="60" placeholder="Coimbatore or Online"></label>
      <label class="f"><span>Seats</span><input name="seats" type="number" min="1" max="1000" value="30"></label></div>
      <label class="f"><span>Venue (shown to members)</span><input name="venue" maxlength="160"></label>
      <label class="f"><span>Online link (optional)</span><input name="join_url" maxlength="300" inputmode="url"></label>
      <label class="f"><span>Description</span><textarea name="description" maxlength="1500"></textarea></label>
      <div class="actions"><button type="button" class="btn line" data-close>Cancel</button><button class="btn" type="submit">Create</button></div></form>`);
    $('#efm').onsubmit = async e => {
      e.preventDefault(); const f = formData(e.target);
      if (f.title.length < 3 || !f.starts_at) return toast('Please add a title and date.');
      const d = new Date(f.starts_at); if (isNaN(d) || d < new Date()) return toast('Please choose a future date.');
      f.starts_at = d.toISOString(); f.join_url = normUrl(f.join_url); f.seats = Math.max(1, Math.min(1000, parseInt(f.seats, 10) || 30));
      try { await API.createEvent(f); toast('Event created'); go('events'); } catch (err) { toast(errMsg(err)); }
    };
  };
}

async function appMembers(el) {
  const all = await API.listMembers(); let q = '', role = 'All', ind = 'All';
  el.innerHTML = head('Directory', 'The <em>members</em>', `${all.length} verified member${all.length === 1 ? '' : 's'}. Contact details are shared only through introductions.`) +
    `<div class="filters"><input id="mq" placeholder="Search name, company, city or need" aria-label="Search members"><select id="mr" aria-label="Role">${opts(['All', ...Object.values(ROLE)])}</select><select id="mi" aria-label="Industry">${opts(['All', ...INDUSTRIES])}</select></div><div class="grid g3" id="ml"></div>`;
  const draw = () => {
    const list = all.filter(m => (role === 'All' || ROLE[m.role] === role) && (ind === 'All' || m.industry === ind) && (!q || [m.name, m.company, m.headline, m.city, m.seeking, m.offering].join(' ').toLowerCase().includes(q)));
    $('#ml').innerHTML = list.map(m => `<div class="mem" data-show="${esc(m.id)}" tabindex="0"><div class="row">${avatar(m)}<div><b style="font-weight:500">${esc(m.name)}</b><div class="xs mu">${esc(m.company || '')}</div></div></div>
      <div class="hl">${esc(String(m.headline || m.bio || '').slice(0, 110))}</div><div class="row" style="gap:10px"><span class="pill ${m.role === 'investor' ? 'n' : ''}">${ROLE[m.role]}</span><span class="xs mu">${esc(m.city || '')}</span></div></div>`).join('')
      || `<div class="empty" style="grid-column:1/-1"><h3>No one matches</h3><p>Try a broader search.</p></div>`;
  };
  $('#mq').oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  $('#mr').onchange = e => { role = e.target.value; draw(); };
  $('#mi').onchange = e => { ind = e.target.value; draw(); };
  draw();
}
async function appMember(el) {
  if (!VIEW_ID) return go('members');
  const m = await API.getMember(VIEW_ID);
  if (!m) { el.innerHTML = `<div class="empty"><h3>Profile unavailable</h3><p>This member is not visible to you.</p></div>`; return; }
  const contact = m.id === ME.id ? null : await API.contactFor(m.id).catch(() => null);
  el.innerHTML = profileHTML(m, contact) + `<div class="actions" style="justify-content:flex-start;margin-top:24px">
    ${m.id !== ME.id ? (contact ? '' : `<button class="btn" id="ri" type="button">Request introduction</button>`) : `<a class="btn line" href="#profile">Edit my profile</a>`}<a class="btn line" href="#members">Back to directory</a></div>`;
  if ($('#ri')) $('#ri').onclick = () => introModal(m, 'Profile · ' + m.name);
}
function profileHTML(m, contact) {
  const kv = [['Company', m.company], ['Role', ROLE[m.role]], ['Industry', m.industry], ['City', m.city], ['Stage', m.role === 'investor' ? '' : m.stage], ['Revenue', m.role === 'investor' ? '' : m.revenue_band]].filter(x => x[1]);
  const blk = (t, v) => v ? `<div class="blk"><h4>${t}</h4><p>${esc(v)}</p></div>` : '';
  return `<div class="prof"><div class="panel"><div class="top">${avatar(m, 'lg')}<div><span class="pill ${m.role === 'investor' ? 'n' : ''}">${ROLE[m.role]} · Verified</span><h1>${esc(m.name)}</h1><p class="mu">${esc(m.headline || '')}</p></div></div>
    <div style="margin-top:22px">${blk('About', m.bio)}${blk(m.role === 'investor' ? 'Track record' : 'Traction', m.traction)}${blk('Looking for', m.seeking)}${blk('Can help with', m.offering)}</div></div>
    <aside><div class="panel"><dl class="kv">${kv.map(x => `<dt>${x[0]}</dt><dd>${esc(x[1])}</dd>`).join('')}</dl>
      <div class="row" style="margin-top:18px;gap:18px;font-size:14px;color:var(--navy)">${ext(m.website, 'Website ↗')}${ext(m.linkedin, 'LinkedIn ↗')}</div></div>
      <div class="panel" style="margin-top:14px"><h3 class="t" style="margin-bottom:8px">Contact</h3><p class="sm">${contact ? `${esc(contact.email)}${contact.phone ? '<br>' + esc(contact.phone) : ''}` : '<span class="mu">Shared after an accepted introduction.</span>'}</p></div></aside></div>`;
}
async function appProfile(el) {
  const m = await API.getMember(ME.id);
  el.innerHTML = head('My profile', 'How members <em>see you</em>', 'Your email and phone are never shown here.', `<div class="seg"><button class="on" data-t="edit" type="button">Edit</button><button data-t="prev" type="button">Preview</button></div>`) + `<div id="pp"></div>`;
  const edit = () => {
    $('#pp').innerHTML = `<form id="ef" class="panel" style="max-width:820px" novalidate><div class="fg">
      <label class="f"><span>Name</span><input name="name" value="${esc(m.name)}" required minlength="2" maxlength="80"></label><label class="f"><span>Company</span><input name="company" value="${esc(m.company)}" maxlength="100"></label></div>
      <label class="f"><span>Headline</span><input name="headline" value="${esc(m.headline)}" maxlength="140" placeholder="One line about what you do"></label>
      <div class="fg"><label class="f"><span>City</span><input name="city" value="${esc(m.city)}" maxlength="60"></label><label class="f"><span>Industry</span><select name="industry">${opts(INDUSTRIES, m.industry)}</select></label>
      ${m.role !== 'investor' ? `<label class="f"><span>Stage</span><select name="stage">${opts(STAGES, m.stage)}</select></label><label class="f"><span>Revenue</span><select name="revenue_band">${opts(REVENUE, m.revenue_band)}</select></label>` : ''}</div>
      <label class="f"><span>About</span><textarea name="bio" maxlength="1200">${esc(m.bio)}</textarea></label>
      <label class="f"><span>${m.role === 'investor' ? 'Track record' : 'Traction'}</span><textarea name="traction" maxlength="600">${esc(m.traction)}</textarea></label>
      <label class="f"><span>Looking for</span><textarea name="seeking" maxlength="600">${esc(m.seeking)}</textarea></label>
      <label class="f"><span>Can help with</span><textarea name="offering" maxlength="600">${esc(m.offering)}</textarea></label>
      <div class="fg"><label class="f"><span>Website</span><input name="website" value="${esc(m.website)}" maxlength="200" inputmode="url"></label><label class="f"><span>LinkedIn</span><input name="linkedin" value="${esc(m.linkedin)}" maxlength="200" inputmode="url"></label></div>
      <div class="actions"><button class="btn" type="submit">Save profile</button></div></form>`;
    $('#ef').onsubmit = async e => {
      e.preventDefault(); const p = formData(e.target);
      if (p.name.length < 2) return toast('Please enter your name.');
      p.website = normUrl(p.website); p.linkedin = normUrl(p.linkedin);
      try { await API.updateMe(p); Object.assign(m, p); toast('Profile saved'); } catch (err) { toast(errMsg(err)); }
    };
  };
  $$('[data-t]').forEach(b => b.onclick = () => { $$('[data-t]').forEach(x => x.classList.toggle('on', x === b)); if (b.dataset.t === 'edit') edit(); else $('#pp').innerHTML = profileHTML(m, null); });
  edit();
}
function appIntros(el, intros) {
  const inc = intros.filter(i => i.to_id === ME.id), out = intros.filter(i => i.from_id === ME.id);
  const st = s => `<span class="pill ${s === 'accepted' ? 'ok' : s === 'declined' ? 'bad' : 'n'}">${esc(s)}</span>`;
  const item = (i, other, incoming) => `<article class="item"><div class="meta">${byline(other)}<span class="when">${ago(i.created_at)}</span></div>
    <div class="xs mu">${esc(i.context || '')}</div><div class="body" style="margin-top:8px">${esc(i.message)}</div>
    <div class="foot">${st(i.status)}${incoming && i.status === 'pending' && other ? `<button class="btn s" data-ac="${esc(i.id)}" type="button">Accept &amp; share contact</button><button class="btn s line" data-dc="${esc(i.id)}" type="button">Decline</button>` : ''}
    ${i.status === 'accepted' && other ? `<button class="btn s line" data-show="${esc(other.id)}" type="button">View contact</button>` : ''}</div></article>`;
  el.innerHTML = head('Introductions', 'By <em>consent</em>', 'Contact details are exchanged only when an introduction is accepted.') +
    `<div class="grid g2" style="align-items:start;gap:22px"><div><h3 style="font-size:20px;margin-bottom:14px">Received</h3>${inc.map(i => item(i, i.from, true)).join('') || `<div class="empty"><p>No requests yet.</p></div>`}</div>
    <div><h3 style="font-size:20px;margin-bottom:14px">Sent</h3>${out.map(i => item(i, i.to, false)).join('') || `<div class="empty"><p>You have not requested any introductions.</p></div>`}</div></div>`;
  $$('[data-ac]').forEach(b => b.onclick = async () => { try { await API.respondIntro(b.dataset.ac, 'accepted'); toast('Accepted. Contact details shared.'); go('intros'); } catch (e) { toast(errMsg(e)); } });
  $$('[data-dc]').forEach(b => b.onclick = async () => { try { await API.respondIntro(b.dataset.dc, 'declined'); toast('Declined'); go('intros'); } catch (e) { toast(errMsg(e)); } });
}
async function appAdmin(el) {
  let tab = 'apps';
  const draw = async () => {
    el.innerHTML = head('Membership desk', 'Run the <em>club</em>', 'Applications, dues and access. Events are managed from the Events page.', `<div class="seg"><button data-t="apps" class="${tab === 'apps' ? 'on' : ''}" type="button">Applications</button><button data-t="mem" class="${tab === 'mem' ? 'on' : ''}" type="button">Members &amp; dues</button></div>`) + `<div id="ad" class="panel tw"><div class="empty">Loading…</div></div>`;
    $$('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    try {
      if (tab === 'apps') {
        const apps = await API.listApplications(), pending = apps.filter(a => a.status === 'pending').length;
        $('#ad').innerHTML = `<p class="sm mu" style="margin-bottom:14px">${pending} awaiting review. Check GST/CIN on the GST portal, the website and LinkedIn before approving. Investors become active at once; others receive the payment page.</p>
        <table><tr><th>Applicant</th><th>Business</th><th>Looking for</th><th>Status</th><th></th></tr>${apps.map(a => `<tr>
          <td><b style="font-weight:500">${esc(a.name)}</b><div class="xs mu">${esc(a.email)}${a.phone ? '<br>' + esc(a.phone) : ''}</div><span class="pill" style="margin-top:8px">${ROLE[a.role] || ''}</span></td>
          <td>${esc(a.company)}<div class="xs mu">${esc(a.city)} · ${esc(a.industry || '')}<br>${esc(a.revenue_band || '')} ${esc(a.stage || '')}<br>GST/CIN: ${esc(a.gst_cin || '—')}</div><div class="xs" style="margin-top:6px;display:flex;gap:12px;color:var(--navy)">${ext(a.website, 'Website')}${ext(a.linkedin, 'LinkedIn')}</div></td>
          <td class="sm mu" style="max-width:260px">${esc(a.seeking)}<div class="xs di" style="margin-top:6px">via ${esc(a.referral || '—')} · ${ago(a.created_at)}</div></td>
          <td><span class="pill ${a.status === 'approved' ? 'ok' : a.status === 'rejected' ? 'bad' : 'n'}">${esc(a.status)}</span></td>
          <td>${a.status === 'pending' ? `<div class="row" style="gap:8px"><button class="btn s" data-ap="${esc(a.id)}" type="button">Approve</button><button class="btn s bad" data-rj="${esc(a.id)}" type="button">Decline</button></div>` : ''}</td></tr>`).join('')}</table>`;
        const find = id => apps.find(a => a.id === id);
        $$('[data-ap]').forEach(b => b.onclick = async () => { try { await API.decideApplication(find(b.dataset.ap), 'approved'); toast('Approved. Send their sign-in and payment link.'); draw(); } catch (e) { toast(errMsg(e)); } });
        $$('[data-rj]').forEach(b => b.onclick = async () => { try { await API.decideApplication(find(b.dataset.rj), 'rejected'); toast('Declined'); draw(); } catch (e) { toast(errMsg(e)); } });
      } else {
        const ms = await API.listAllMembers();
        $('#ad').innerHTML = `<p class="sm mu" style="margin-bottom:14px">When a payment arrives in Razorpay, set the member to <b>active</b>, choose the plan and the date paid until. Access stops automatically after that date.</p>
        <table><tr><th>Member</th><th>Role</th><th>Status</th><th>Plan</th><th>Paid until</th><th></th></tr>${ms.map(m => `<tr>
          <td><b style="font-weight:500">${esc(m.name)}</b><div class="xs mu">${esc(m.company)}<br>${esc(m.email || '')}</div></td><td class="sm">${ROLE[m.role]}${m.is_admin ? ' · admin' : ''}</td>
          <td><select data-f="status">${['approved', 'active', 'suspended'].map(s => `<option ${m.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
          <td><select data-f="plan">${['', 'founding', 'founder', 'business', 'investor', 'comp'].map(s => `<option value="${s}" ${(m.plan || '') === s ? 'selected' : ''}>${s || '—'}</option>`).join('')}</select></td>
          <td><input type="date" data-f="paid_until" value="${esc(String(m.paid_until || '').slice(0, 10))}"></td>
          <td><button class="btn s" data-save="${esc(m.id)}" type="button">Save</button></td></tr>`).join('')}</table>`;
        $$('[data-save]').forEach(b => b.onclick = async () => {
          const tr = b.closest('tr'), p = {}; tr.querySelectorAll('[data-f]').forEach(i => p[i.dataset.f] = i.value || '');
          try { await API.setMember(b.dataset.save, p); toast('Saved'); } catch (e) { toast(errMsg(e)); }
        });
      }
    } catch (e) { $('#ad').innerHTML = `<div class="empty"><p>${esc(errMsg(e))}</p></div>`; }
  };
  draw();
}

boot().catch(e => { $('#root').innerHTML = `<div class="wrap page"><div class="solo"><h1>Could not start</h1><p class="mu">${esc(e.message)}</p></div></div>`; });
})();
