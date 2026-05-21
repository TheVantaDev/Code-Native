/**
 * portfolioTemplate.ts
 * Hardcoded demo command — instantly creates a full portfolio project
 * (HTML + CSS + JS + Python Flask backend) when user types "make portfolio".
 * Bypasses the LLM entirely for demo reliability.
 */

export interface PortfolioFile {
  relativePath: string;
  content: string;
}

export const PORTFOLIO_FILES: PortfolioFile[] = [
  // ──────────────────────────────────────────────
  // 1. index.html
  // ──────────────────────────────────────────────
  {
    relativePath: 'index.html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Alex Johnson — Full-Stack Developer Portfolio" />
  <title>Alex Johnson — Portfolio</title>
  <link rel="stylesheet" href="style.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet" />
</head>
<body>

  <!-- ── NAVIGATION ── -->
  <nav class="nav" id="nav">
    <div class="nav-logo">
      <span class="logo-bracket">&lt;</span>AJ<span class="logo-bracket">/&gt;</span>
    </div>
    <ul class="nav-links">
      <li><a href="#about">About</a></li>
      <li><a href="#skills">Skills</a></li>
      <li><a href="#projects">Projects</a></li>
      <li><a href="#contact">Contact</a></li>
    </ul>
    <button class="nav-cta" onclick="document.getElementById('contact').scrollIntoView({behavior:'smooth'})">Hire Me</button>
  </nav>

  <!-- ── HERO ── -->
  <section class="hero" id="home">
    <canvas id="particles"></canvas>
    <div class="hero-orb hero-orb-1"></div>
    <div class="hero-orb hero-orb-2"></div>
    <div class="hero-content">
      <div class="hero-badge">&#x1F44B; Open to Opportunities</div>
      <h1 class="hero-title">Hi, I'm <span class="gradient-text">Alex Johnson</span></h1>
      <div class="hero-typed-wrap">
        <span class="typed-prefix">I build </span>
        <span class="typed-text" id="typed"></span><span class="typed-cursor">|</span>
      </div>
      <p class="hero-desc">Full-stack developer crafting elegant, performant web experiences. Passionate about clean code and beautiful UI that users love.</p>
      <div class="hero-actions">
        <a href="#projects" class="btn btn-primary">View My Work</a>
        <a href="#contact" class="btn btn-outline">Get In Touch</a>
      </div>
      <div class="hero-stats">
        <div class="stat"><span class="stat-num">3+</span><span class="stat-label">Years Exp</span></div>
        <div class="stat-divider"></div>
        <div class="stat"><span class="stat-num">20+</span><span class="stat-label">Projects</span></div>
        <div class="stat-divider"></div>
        <div class="stat"><span class="stat-num">15+</span><span class="stat-label">Clients</span></div>
      </div>
    </div>
    <div class="hero-visual">
      <div class="hero-avatar">
        <div class="avatar-ring"></div>
        <div class="avatar-inner">AJ</div>
      </div>
      <div class="floating-card card-1">&#x269B;&#xFE0F; React Expert</div>
      <div class="floating-card card-2">&#x1F40D; Python Dev</div>
      <div class="floating-card card-3">&#x1F3A8; UI/UX Design</div>
    </div>
  </section>

  <!-- ── ABOUT ── -->
  <section class="section about" id="about">
    <div class="container">
      <div class="section-header reveal">
        <span class="section-tag">About Me</span>
        <h2>Who I Am</h2>
        <p>A passionate developer building products that make a difference</p>
      </div>
      <div class="about-grid">
        <div class="about-text reveal">
          <p>I'm a full-stack developer with 3+ years of experience building modern web applications. I specialize in React, Python, and scalable cloud architecture.</p>
          <p>When I'm not coding, you'll find me contributing to open source, writing tech blogs, or exploring the latest in AI and machine learning.</p>
          <div class="about-tags">
            <span class="tag">&#x1F393; B.Tech Computer Science</span>
            <span class="tag">&#x1F4CD; Mumbai, India</span>
            <span class="tag">&#x1F4BC; Open to Work</span>
          </div>
          <a href="#" class="btn btn-primary">Download Resume</a>
        </div>
        <div class="about-card reveal">
          <div class="glass-card">
            <h3>Quick Facts</h3>
            <ul class="facts-list">
              <li><span class="fact-icon">&#x1F680;</span> 20+ Projects Delivered</li>
              <li><span class="fact-icon">&#x2B50;</span> 100% Client Satisfaction</li>
              <li><span class="fact-icon">&#x1F310;</span> Remote-First Developer</li>
              <li><span class="fact-icon">&#x1F4DA;</span> Always Learning</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── SKILLS ── -->
  <section class="section skills" id="skills">
    <div class="container">
      <div class="section-header reveal">
        <span class="section-tag">Expertise</span>
        <h2>Skills &amp; Technologies</h2>
        <p>Tools and technologies I work with every day</p>
      </div>
      <div class="skills-grid">
        <div class="skill-category reveal">
          <h3>&#x1F5A5; Frontend</h3>
          <div class="skill-item"><span>React / Next.js</span><div class="skill-bar"><div class="skill-fill" data-width="92"></div></div></div>
          <div class="skill-item"><span>HTML / CSS</span><div class="skill-bar"><div class="skill-fill" data-width="96"></div></div></div>
          <div class="skill-item"><span>TypeScript</span><div class="skill-bar"><div class="skill-fill" data-width="85"></div></div></div>
          <div class="skill-item"><span>JavaScript</span><div class="skill-bar"><div class="skill-fill" data-width="90"></div></div></div>
        </div>
        <div class="skill-category reveal">
          <h3>&#x2699;&#xFE0F; Backend</h3>
          <div class="skill-item"><span>Python / Flask</span><div class="skill-bar"><div class="skill-fill" data-width="88"></div></div></div>
          <div class="skill-item"><span>Node.js / Express</span><div class="skill-bar"><div class="skill-fill" data-width="82"></div></div></div>
          <div class="skill-item"><span>REST APIs</span><div class="skill-bar"><div class="skill-fill" data-width="91"></div></div></div>
          <div class="skill-item"><span>SQL / MongoDB</span><div class="skill-bar"><div class="skill-fill" data-width="80"></div></div></div>
        </div>
        <div class="skill-category reveal">
          <h3>&#x2601;&#xFE0F; Tools &amp; Cloud</h3>
          <div class="skill-item"><span>Git / GitHub</span><div class="skill-bar"><div class="skill-fill" data-width="95"></div></div></div>
          <div class="skill-item"><span>Docker</span><div class="skill-bar"><div class="skill-fill" data-width="75"></div></div></div>
          <div class="skill-item"><span>AWS / GCP</span><div class="skill-bar"><div class="skill-fill" data-width="70"></div></div></div>
          <div class="skill-item"><span>Linux</span><div class="skill-bar"><div class="skill-fill" data-width="82"></div></div></div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── PROJECTS ── -->
  <section class="section projects" id="projects">
    <div class="container">
      <div class="section-header reveal">
        <span class="section-tag">Portfolio</span>
        <h2>Featured Projects</h2>
        <p>A selection of my recent work</p>
      </div>
      <div class="projects-grid">
        <div class="project-card featured reveal">
          <div class="project-image">
            <div class="project-mockup">
              <div class="mockup-bar"></div>
              <div class="mockup-content"></div>
            </div>
          </div>
          <div class="project-info">
            <span class="project-badge">&#x1F31F; Featured</span>
            <h3>AI Code Assistant IDE</h3>
            <p>A full-featured IDE with an AI assistant powered by local LLMs. Features context-aware code suggestions, file operations, RAG search, and project scaffolding — all without cloud dependency.</p>
            <div class="project-tech"><span>TypeScript</span><span>Python</span><span>React</span><span>Ollama</span></div>
            <div class="project-links">
              <a href="#" class="btn btn-sm btn-primary">Live Demo</a>
              <a href="#" class="btn btn-sm btn-outline">GitHub &rarr;</a>
            </div>
          </div>
        </div>
        <div class="project-card reveal">
          <div class="project-header-color color-1"></div>
          <div class="project-info">
            <h3>E-Commerce Platform</h3>
            <p>Full-stack store with real-time inventory, Stripe payments, and admin dashboard. Handles 10k+ daily transactions.</p>
            <div class="project-tech"><span>React</span><span>Flask</span><span>PostgreSQL</span></div>
            <div class="project-links"><a href="#" class="btn btn-sm btn-outline">View &rarr;</a></div>
          </div>
        </div>
        <div class="project-card reveal">
          <div class="project-header-color color-2"></div>
          <div class="project-info">
            <h3>ML Dashboard</h3>
            <p>Real-time model monitoring with live metrics, drift detection, and automated retraining alerts.</p>
            <div class="project-tech"><span>Python</span><span>Scikit-learn</span><span>D3.js</span></div>
            <div class="project-links"><a href="#" class="btn btn-sm btn-outline">View &rarr;</a></div>
          </div>
        </div>
        <div class="project-card reveal">
          <div class="project-header-color color-3"></div>
          <div class="project-info">
            <h3>Real-Time Chat App</h3>
            <p>Encrypted chat with rooms, file sharing, and video calls. Supports 1000+ concurrent users with WebSockets.</p>
            <div class="project-tech"><span>Node.js</span><span>Socket.io</span><span>MongoDB</span></div>
            <div class="project-links"><a href="#" class="btn btn-sm btn-outline">View &rarr;</a></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── CONTACT ── -->
  <section class="section contact" id="contact">
    <div class="container">
      <div class="section-header reveal">
        <span class="section-tag">Contact</span>
        <h2>Let's Work Together</h2>
        <p>Have a project in mind? Let's build something amazing</p>
      </div>
      <div class="contact-grid">
        <div class="contact-info">
          <div class="contact-item reveal">
            <div class="contact-icon">&#x1F4E7;</div>
            <div><h4>Email</h4><p>alex@example.com</p></div>
          </div>
          <div class="contact-item reveal">
            <div class="contact-icon">&#x1F4F1;</div>
            <div><h4>Phone</h4><p>+91 98765 43210</p></div>
          </div>
          <div class="contact-item reveal">
            <div class="contact-icon">&#x1F30E;</div>
            <div><h4>LinkedIn</h4><p>linkedin.com/in/alexjohnson</p></div>
          </div>
          <div class="social-links reveal">
            <a href="#" class="social-btn">GitHub</a>
            <a href="#" class="social-btn">LinkedIn</a>
            <a href="#" class="social-btn">Twitter</a>
          </div>
        </div>
        <form class="contact-form reveal" id="contactForm">
          <div class="form-row">
            <div class="form-group">
              <label>Your Name</label>
              <input type="text" name="name" placeholder="John Doe" required />
            </div>
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" name="email" placeholder="john@example.com" required />
            </div>
          </div>
          <div class="form-group">
            <label>Subject</label>
            <input type="text" name="subject" placeholder="Project Discussion" required />
          </div>
          <div class="form-group">
            <label>Message</label>
            <textarea name="message" rows="5" placeholder="Tell me about your project..." required></textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-full">Send Message &#x1F680;</button>
          <div class="form-status" id="formStatus"></div>
        </form>
      </div>
    </div>
  </section>

  <!-- ── FOOTER ── -->
  <footer class="footer">
    <div class="container">
      <div class="footer-content">
        <div class="nav-logo"><span class="logo-bracket">&lt;</span>AJ<span class="logo-bracket">/&gt;</span></div>
        <p>Built with &#x2764;&#xFE0F; using HTML, CSS, JavaScript &amp; Python Flask</p>
        <p class="footer-copy">&copy; 2025 Alex Johnson. All rights reserved.</p>
      </div>
    </div>
  </footer>

  <script src="script.js"></script>
</body>
</html>`,
  },

  // ──────────────────────────────────────────────
  // 2. style.css
  // ──────────────────────────────────────────────
  {
    relativePath: 'style.css',
    content: `/* ── Reset & Variables ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:          #050816;
  --bg-card:     #0d1b2e;
  --bg-glass:    rgba(13, 27, 46, 0.75);
  --primary:     #7c3aed;
  --primary-lt:  #a855f7;
  --accent:      #06b6d4;
  --text:        #e2e8f0;
  --text-muted:  #94a3b8;
  --border:      rgba(124, 58, 237, 0.22);
  --gradient:    linear-gradient(135deg, #7c3aed, #06b6d4);
  --radius:      16px;
  --shadow:      0 25px 50px -12px rgba(0,0,0,0.6);
  --ease:        0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

html { scroll-behavior: smooth; }
body {
  font-family: 'Inter', sans-serif;
  background: var(--bg);
  color: var(--text);
  overflow-x: hidden;
  line-height: 1.65;
}

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--primary); border-radius: 3px; }

/* ── Typography ── */
h1 { font-size: clamp(2.4rem, 6vw, 4.5rem); font-weight: 800; line-height: 1.1; }
h2 { font-size: clamp(1.8rem, 4vw, 2.8rem); font-weight: 700; }
h3 { font-size: 1.2rem; font-weight: 600; }

.gradient-text {
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ── Layout ── */
.container { max-width: 1180px; margin: 0 auto; padding: 0 2rem; }
.section { padding: 6rem 0; }

.section-header { text-align: center; margin-bottom: 3.5rem; }
.section-header h2 { margin-bottom: 0.6rem; }
.section-header p { color: var(--text-muted); max-width: 480px; margin: 0.5rem auto 0; }

.section-tag {
  display: inline-block;
  background: rgba(124,58,237,0.12);
  color: var(--primary-lt);
  border: 1px solid var(--border);
  padding: 0.25rem 1rem;
  border-radius: 50px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 0.9rem;
}

/* ── Navigation ── */
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.2rem 2.5rem;
  background: rgba(5,8,22,0.82);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(124,58,237,0.12);
  transition: padding var(--ease);
}
.nav.scrolled { padding: 0.7rem 2.5rem; }

.nav-logo {
  font-size: 1.2rem; font-weight: 800;
  font-family: 'Fira Code', monospace;
}
.logo-bracket { color: var(--primary-lt); }

.nav-links { display: flex; gap: 2.2rem; list-style: none; }
.nav-links a {
  color: var(--text-muted); text-decoration: none;
  font-size: 0.88rem; font-weight: 500;
  transition: color var(--ease);
}
.nav-links a:hover { color: var(--text); }

.nav-cta {
  background: var(--gradient); color: white; border: none;
  padding: 0.5rem 1.25rem; border-radius: 8px;
  font-size: 0.85rem; font-weight: 600;
  cursor: pointer; transition: var(--ease);
}
.nav-cta:hover { opacity: 0.85; transform: translateY(-1px); }

/* ── Buttons ── */
.btn {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.75rem 1.75rem; border-radius: 10px;
  font-weight: 600; font-size: 0.9rem;
  text-decoration: none; cursor: pointer; border: none;
  transition: all var(--ease);
}
.btn-primary { background: var(--gradient); color: white; }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(124,58,237,0.4); }
.btn-outline { background: transparent; color: var(--text); border: 1px solid var(--border); }
.btn-outline:hover { border-color: var(--primary-lt); color: var(--primary-lt); transform: translateY(-2px); }
.btn-sm { padding: 0.45rem 1rem; font-size: 0.8rem; }
.btn-full { width: 100%; justify-content: center; }

/* ── Hero ── */
.hero {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: space-between;
  padding: 8rem 5vw 4rem;
  position: relative; overflow: hidden; gap: 3rem;
}

#particles { position: absolute; inset: 0; z-index: 0; pointer-events: none; }

.hero-orb {
  position: absolute; border-radius: 50%;
  filter: blur(110px); pointer-events: none; z-index: 0;
}
.hero-orb-1 {
  width: 520px; height: 520px;
  background: rgba(124,58,237,0.18);
  top: -120px; right: -120px;
  animation: orbFloat 9s ease-in-out infinite;
}
.hero-orb-2 {
  width: 380px; height: 380px;
  background: rgba(6,182,212,0.13);
  bottom: -80px; left: -80px;
  animation: orbFloat 11s ease-in-out infinite reverse;
}
@keyframes orbFloat { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(25px,-25px) scale(1.04)} }

.hero-content { position: relative; z-index: 1; max-width: 580px; }

.hero-badge {
  display: inline-flex; align-items: center; gap: 0.5rem;
  background: rgba(6,182,212,0.1); border: 1px solid rgba(6,182,212,0.28);
  color: var(--accent); padding: 0.35rem 1rem;
  border-radius: 50px; font-size: 0.82rem; font-weight: 500;
  margin-bottom: 1.4rem;
  animation: fadeInDown 0.6s ease both;
}

.hero-title { margin-bottom: 0.9rem; animation: fadeInUp 0.6s 0.1s ease both; }

.hero-typed-wrap {
  font-size: clamp(1.1rem, 2.5vw, 1.45rem);
  font-family: 'Fira Code', monospace;
  color: var(--text-muted); margin-bottom: 1.4rem;
  animation: fadeInUp 0.6s 0.2s ease both;
}
.typed-text { color: var(--primary-lt); }
.typed-cursor { color: var(--primary-lt); animation: blink 1s step-end infinite; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

.hero-desc {
  color: var(--text-muted); font-size: 1.02rem;
  max-width: 470px; margin-bottom: 2rem;
  animation: fadeInUp 0.6s 0.3s ease both;
}

.hero-actions {
  display: flex; gap: 1rem; margin-bottom: 2.5rem;
  flex-wrap: wrap; animation: fadeInUp 0.6s 0.4s ease both;
}

.hero-stats {
  display: flex; align-items: center; gap: 1.5rem;
  animation: fadeInUp 0.6s 0.5s ease both;
}
.stat { display: flex; flex-direction: column; }
.stat-num {
  font-size: 1.7rem; font-weight: 800; line-height: 1;
  background: var(--gradient);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.stat-label { font-size: 0.73rem; color: var(--text-muted); }
.stat-divider { width: 1px; height: 38px; background: var(--border); }

/* ── Hero Avatar ── */
.hero-visual {
  position: relative; z-index: 1; flex-shrink: 0;
  width: 320px; height: 320px;
  display: flex; align-items: center; justify-content: center;
  animation: fadeInRight 0.8s 0.3s ease both;
}
.hero-avatar { position: relative; width: 210px; height: 210px; }
.avatar-ring {
  position: absolute; inset: -8px; border-radius: 50%;
  background: conic-gradient(#7c3aed, #06b6d4, #7c3aed);
  animation: spin 7s linear infinite;
  mask: radial-gradient(circle, transparent 53%, black 54%);
  -webkit-mask: radial-gradient(circle, transparent 53%, black 54%);
}
@keyframes spin { to { transform: rotate(360deg); } }
.avatar-inner {
  width: 100%; height: 100%; border-radius: 50%;
  background: linear-gradient(135deg, #1a1a40, #0d1b2e);
  display: flex; align-items: center; justify-content: center;
  font-size: 3.8rem; font-weight: 800;
  color: var(--primary-lt);
  font-family: 'Fira Code', monospace;
  border: 2px solid var(--border);
}
.floating-card {
  position: absolute;
  background: var(--bg-glass); backdrop-filter: blur(18px);
  border: 1px solid var(--border); border-radius: 12px;
  padding: 0.55rem 1.1rem; font-size: 0.78rem; font-weight: 600;
  white-space: nowrap; box-shadow: var(--shadow);
}
.card-1 { top: 0; left: -24px; animation: float1 4s ease-in-out infinite; }
.card-2 { bottom: 44px; right: -28px; animation: float2 5s ease-in-out infinite; }
.card-3 { bottom: 4px; left: -28px; animation: float3 4.5s ease-in-out infinite; }
@keyframes float1 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
@keyframes float2 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(12px)} }
@keyframes float3 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }

/* ── About ── */
.about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; align-items: center; }
.about-text p { color: var(--text-muted); font-size: 1.02rem; margin-bottom: 1.1rem; }
.about-tags { display: flex; flex-wrap: wrap; gap: 0.7rem; margin: 1.4rem 0; }
.tag {
  background: rgba(124,58,237,0.08); border: 1px solid var(--border);
  border-radius: 8px; padding: 0.35rem 0.85rem;
  font-size: 0.82rem; color: var(--text-muted);
}
.glass-card {
  background: var(--bg-glass); backdrop-filter: blur(20px);
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 2rem; box-shadow: var(--shadow);
}
.glass-card h3 { margin-bottom: 1.2rem; color: var(--primary-lt); }
.facts-list { list-style: none; display: flex; flex-direction: column; gap: 0.9rem; }
.facts-list li { display: flex; align-items: center; gap: 0.7rem; color: var(--text-muted); font-size: 0.92rem; }
.fact-icon { font-size: 1.15rem; }

/* ── Skills ── */
.skills-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1.75rem; }
.skill-category {
  background: var(--bg-glass); backdrop-filter: blur(20px);
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 1.75rem; transition: all var(--ease);
}
.skill-category:hover {
  border-color: rgba(124,58,237,0.45);
  transform: translateY(-5px);
  box-shadow: 0 20px 40px rgba(0,0,0,0.3), 0 0 20px rgba(124,58,237,0.1);
}
.skill-category h3 { color: var(--primary-lt); margin-bottom: 1.4rem; font-family: 'Fira Code', monospace; font-size: 0.95rem; }
.skill-item { margin-bottom: 1.2rem; }
.skill-item > span { display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.4rem; }
.skill-bar { height: 5px; background: rgba(255,255,255,0.07); border-radius: 3px; overflow: hidden; }
.skill-fill { height: 100%; background: var(--gradient); border-radius: 3px; width: 0%; transition: width 1.3s cubic-bezier(0.4,0,0.2,1); }

/* ── Projects ── */
.projects-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
.project-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden; transition: all var(--ease);
}
.project-card:hover {
  border-color: rgba(124,58,237,0.45);
  transform: translateY(-5px);
  box-shadow: 0 20px 40px rgba(0,0,0,0.4);
}
.project-card.featured { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; }
.project-image {
  background: linear-gradient(135deg, #0d1b2e, #1a1a40);
  min-height: 200px; display: flex; align-items: center;
  justify-content: center; overflow: hidden; padding: 2rem;
}
.project-mockup {
  width: 80%; background: rgba(124,58,237,0.08);
  border: 1px solid var(--border); border-radius: 10px;
  overflow: hidden;
}
.mockup-bar { height: 28px; background: rgba(124,58,237,0.2); border-bottom: 1px solid var(--border); }
.mockup-content {
  height: 120px; background: repeating-linear-gradient(
    180deg, rgba(124,58,237,0.06) 0px, rgba(124,58,237,0.06) 1px,
    transparent 1px, transparent 22px
  );
}
.project-header-color { height: 5px; }
.color-1 { background: linear-gradient(90deg, #7c3aed, #06b6d4); }
.color-2 { background: linear-gradient(90deg, #f59e0b, #ef4444); }
.color-3 { background: linear-gradient(90deg, #10b981, #06b6d4); }

.project-info { padding: 1.6rem; }
.project-info h3 { margin-bottom: 0.65rem; }
.project-info p { color: var(--text-muted); font-size: 0.875rem; line-height: 1.65; margin-bottom: 1.2rem; }
.project-badge {
  display: inline-block;
  background: rgba(6,182,212,0.12); color: var(--accent);
  border: 1px solid rgba(6,182,212,0.28);
  padding: 0.18rem 0.7rem; border-radius: 4px;
  font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
  margin-bottom: 0.65rem;
}
.project-tech { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 1.2rem; }
.project-tech span {
  background: rgba(124,58,237,0.09); border: 1px solid var(--border);
  color: var(--text-muted); padding: 0.22rem 0.65rem;
  border-radius: 6px; font-size: 0.75rem; font-family: 'Fira Code', monospace;
}
.project-links { display: flex; gap: 0.7rem; }

/* ── Contact ── */
.contact-grid { display: grid; grid-template-columns: 1fr 1.6fr; gap: 4rem; align-items: start; }
.contact-info { display: flex; flex-direction: column; gap: 1.2rem; }
.contact-item {
  display: flex; align-items: flex-start; gap: 1rem;
  background: var(--bg-glass); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1.2rem; transition: var(--ease);
}
.contact-item:hover { border-color: rgba(124,58,237,0.45); }
.contact-icon {
  font-size: 1.4rem; width: 46px; height: 46px; flex-shrink: 0;
  background: rgba(124,58,237,0.13); border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
}
.contact-item h4 { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.2rem; }
.contact-item p { font-size: 0.9rem; color: var(--text); }
.social-links { display: flex; gap: 0.7rem; margin-top: 0.5rem; }
.social-btn {
  background: rgba(124,58,237,0.08); border: 1px solid var(--border);
  color: var(--text-muted); padding: 0.45rem 0.9rem;
  border-radius: 8px; font-size: 0.82rem; text-decoration: none;
  font-weight: 500; transition: var(--ease);
}
.social-btn:hover { border-color: var(--primary-lt); color: var(--primary-lt); }

.contact-form {
  background: var(--bg-glass); backdrop-filter: blur(20px);
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 2.25rem;
}
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.form-group { display: flex; flex-direction: column; gap: 0.45rem; margin-bottom: 1.1rem; }
.form-group label { font-size: 0.82rem; font-weight: 500; color: var(--text-muted); }
.form-group input, .form-group textarea {
  background: rgba(255,255,255,0.04); border: 1px solid var(--border);
  border-radius: 10px; padding: 0.8rem 1rem; color: var(--text);
  font-size: 0.88rem; font-family: 'Inter', sans-serif;
  transition: var(--ease); outline: none; resize: vertical;
}
.form-group input:focus, .form-group textarea:focus {
  border-color: var(--primary-lt);
  box-shadow: 0 0 0 3px rgba(124,58,237,0.15);
}
.form-group input::placeholder, .form-group textarea::placeholder { color: rgba(148,163,184,0.4); }
.form-status { margin-top: 0.9rem; padding: 0.7rem 1rem; border-radius: 8px; font-size: 0.875rem; display: none; }
.form-status.success { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); color: #10b981; display: block; }
.form-status.error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; display: block; }

/* ── Footer ── */
.footer { border-top: 1px solid var(--border); padding: 2.5rem 0; }
.footer-content { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.7rem; }
.footer-content p { color: var(--text-muted); font-size: 0.88rem; }
.footer-copy { font-size: 0.78rem; opacity: 0.7; }

/* ── Animations ── */
@keyframes fadeInDown { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeInUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeInRight { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:translateX(0)} }

.reveal { opacity: 0; transform: translateY(28px); transition: opacity 0.7s ease, transform 0.7s ease; }
.reveal.visible { opacity: 1; transform: translateY(0); }

/* ── Responsive ── */
@media (max-width: 960px) {
  .hero { flex-direction: column; text-align: center; padding: 7rem 2rem 4rem; }
  .hero-content { max-width: 100%; }
  .hero-actions, .hero-stats { justify-content: center; }
  .hero-visual { width: 260px; height: 260px; }
  .about-grid, .contact-grid { grid-template-columns: 1fr; }
  .skills-grid { grid-template-columns: 1fr; }
  .projects-grid { grid-template-columns: 1fr; }
  .project-card.featured { grid-template-columns: 1fr; }
  .form-row { grid-template-columns: 1fr; }
  .nav-links { display: none; }
}`,
  },

  // ──────────────────────────────────────────────
  // 3. script.js
  // ──────────────────────────────────────────────
  {
    relativePath: 'script.js',
    content: `// ── Typed Animation ──
const words = ['Web Applications', 'REST APIs', 'Beautiful UIs', 'Data Pipelines', 'ML Models', 'Mobile Apps'];
let wIdx = 0, cIdx = 0, deleting = false;
const typedEl = document.getElementById('typed');

function type() {
  const word = words[wIdx % words.length];
  typedEl.textContent = deleting ? word.slice(0, --cIdx) : word.slice(0, ++cIdx);

  let delay = deleting ? 55 : 100;
  if (!deleting && cIdx === word.length) { deleting = true; delay = 2000; }
  else if (deleting && cIdx === 0) { deleting = false; wIdx++; delay = 350; }

  setTimeout(type, delay);
}
window.addEventListener('DOMContentLoaded', () => setTimeout(type, 900));

// ── Particle Canvas ──
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');

function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
resize();
window.addEventListener('resize', resize);

class Dot {
  constructor() { this.reset(); }
  reset() {
    this.x  = Math.random() * canvas.width;
    this.y  = Math.random() * canvas.height;
    this.r  = Math.random() * 1.4 + 0.4;
    this.vx = (Math.random() - 0.5) * 0.35;
    this.vy = (Math.random() - 0.5) * 0.35;
    this.a  = Math.random() * 0.38 + 0.08;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) this.reset();
  }
  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = \`rgba(124,58,237,\${this.a})\`;
    ctx.fill();
  }
}

const dots = Array.from({ length: 65 }, () => new Dot());

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  dots.forEach(d => { d.update(); d.draw(); });
  dots.forEach((a, i) => dots.slice(i + 1).forEach(b => {
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (dist < 115) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = \`rgba(124,58,237,\${0.1 * (1 - dist / 115)})\`;
      ctx.lineWidth = 0.5; ctx.stroke();
    }
  }));
  requestAnimationFrame(animate);
}
animate();

// ── Scroll Reveal ──
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// ── Skill Bars ──
const skillIO = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.querySelectorAll('.skill-fill').forEach(bar => {
        bar.style.width = bar.dataset.width + '%';
      });
    }
  });
}, { threshold: 0.35 });
document.querySelectorAll('.skills-grid').forEach(el => skillIO.observe(el));

// ── Sticky Nav ──
window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', scrollY > 50);
});

// ── Contact Form → Flask API ──
document.getElementById('contactForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('button[type="submit"]');
  const status = document.getElementById('formStatus');
  const data = Object.fromEntries(new FormData(form));

  btn.textContent = 'Sending...';
  btn.disabled = true;
  status.className = 'form-status';

  try {
    const res  = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();

    if (res.ok) {
      status.textContent = '✅ Message sent! I\\'ll get back to you within 24 hours.';
      status.className   = 'form-status success';
      form.reset();
    } else {
      throw new Error(json.error || 'Send failed');
    }
  } catch (err) {
    status.textContent = '❌ ' + (err.message || 'Something went wrong, please try again.');
    status.className   = 'form-status error';
  } finally {
    btn.textContent = 'Send Message 🚀';
    btn.disabled    = false;
  }
});`,
  },

  // ──────────────────────────────────────────────
  // 4. app.py  (Flask backend)
  // ──────────────────────────────────────────────
  {
    relativePath: 'app.py',
    content: `"""
Portfolio Backend — Flask
Run:  pip install flask flask-cors
      python app.py
Open: http://localhost:5000
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime
import os

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# In-memory message store (swap for a DB in production)
messages_store = []


# ── Serve Frontend ──

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)


# ── API: Contact Form ──

@app.route('/api/contact', methods=['POST'])
def contact():
    data = request.get_json(silent=True) or {}

    required = ['name', 'email', 'subject', 'message']
    for field in required:
        if not str(data.get(field, '')).strip():
            return jsonify({'error': f'Field "{field}" is required'}), 400

    entry = {
        'id':        len(messages_store) + 1,
        'name':      data['name'].strip(),
        'email':     data['email'].strip(),
        'subject':   data['subject'].strip(),
        'message':   data['message'].strip(),
        'timestamp': datetime.now().isoformat(),
        'read':      False,
    }
    messages_store.append(entry)

    print(f"[Contact] #{entry['id']} from {entry['name']} <{entry['email']}> — {entry['subject']}")

    return jsonify({
        'success': True,
        'message': "Thank you! I'll get back to you within 24 hours.",
        'id':      entry['id'],
    }), 200


# ── API: View Messages (admin) ──

@app.route('/api/messages', methods=['GET'])
def get_messages():
    return jsonify(messages_store), 200


@app.route('/api/messages/<int:msg_id>/read', methods=['PATCH'])
def mark_read(msg_id):
    for msg in messages_store:
        if msg['id'] == msg_id:
            msg['read'] = True
            return jsonify({'success': True}), 200
    return jsonify({'error': 'Message not found'}), 404


# ── API: Health Check ──

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status':    'ok',
        'messages':  len(messages_store),
        'timestamp': datetime.now().isoformat(),
    }), 200


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"\\n🚀  Portfolio server → http://localhost:{port}")
    print(f"📧  Contact API    → http://localhost:{port}/api/contact")
    print(f"💬  Messages       → http://localhost:{port}/api/messages\\n")
    app.run(debug=True, host='0.0.0.0', port=port)
`,
  },

  // ──────────────────────────────────────────────
  // 5. requirements.txt
  // ──────────────────────────────────────────────
  {
    relativePath: 'requirements.txt',
    content: `flask>=2.3.0
flask-cors>=4.0.0
`,
  },
];
