# Launch playbook — Cottage Grove greenhouse model

A pragmatic launch sequence built on two ideas:

1. **Hormozi's give-away-value play actually works** — but only when the value is _legible_ at a glance. A 9k-LOC repo isn't legible. A 60-second screen recording of the live model running a full year is. Lead with the artifact people can _feel_, not the codebase they have to read.
2. **The bibliography is the second asset.** Tagging 14 institutions pulls each of their alumni networks toward the post. But: don't tag in the body — tag in a follow-up comment. LinkedIn's algorithm penalizes "alert spam" posts and the pros all know it.

## The asset stack (build these once, use everywhere)

In rough order of impact:

| Asset | Time to build | Where it ships |
|---|---|---|
| 60-90 sec screen recording (live sim ≥ 1 day, range-play ≥ 1 season, tab-flip Build sheet → Cultivation science → Live) | 30 min | LinkedIn primary post, X video, README hero |
| 3 stills: HUD overlay, atrium vents open, plant growth time-lapse strip (clone → late flower) | 15 min | LinkedIn carousel, X thread, HN OP |
| Hosted demo URL (Vercel, free) | 30 min | The link itself is the offer |
| README rewrite — top of file: "what it is / what it does / who it's for / live demo / clone in 60 seconds" | 30 min | GitHub OP |
| One-pager PDF: 4 KPIs from a real scenario + science citations footer | 45 min | DM-able to industry contacts |

The screen recording is the single most-shared piece. Use macOS built-in Screen Recording (Cmd+Shift+5), record at 1440p, then run it through [HandBrake](https://handbrake.fr) at 8 Mbps to get under LinkedIn's video size cap. **No music** — let the camera move and the simulation tell the story.

## Distribution sequence (one week)

| Day | Channel | Action |
|---|---|---|
| Mon AM | Hosted demo + README ship | Push to Vercel, link in bio |
| Mon PM | LinkedIn primary post | See template below |
| Tue | LinkedIn comment with institutional tags | Adds alumni reach without algorithm penalty on OP |
| Wed | Show HN: "I built a peer-reviewed cannabis greenhouse model with Claude" | Different audience (technical), different motivation (curiosity) |
| Thu | X thread (5-7 tweets, image-heavy) | Catches the people who don't read LinkedIn |
| Fri | DMs: 5 cannabis ops contacts + 3 MIT professors + 2 greenhouse vendors (Stuppy, Nexus, GreenTek) | Personal asks > broadcast |
| Weekend | Reply to every comment | Replies are where the connections actually form, especially from tagged institutions |

The comment-with-tags pattern is the real trick. LinkedIn down-ranks posts with > 3-4 mentions in the OP. You get the same exposure with no penalty by tagging in a follow-up comment, and the comment notification is what pulls the alumni in.

## On bundling with the MIT agentic AI certificate

This is a strong combination if structured right. The risk is dilution: most cert announcements read as student content and most "I built a thing" posts read as ego. Bundled correctly, the two reinforce — the cert is the proof you have the skills, the artifact is the proof you can apply them in production. That sequence beats either post alone.

**Rules for the combo:**

1. **Lead with the artifact, not the cert.** First image and first line are the model. The cert appears in slide 2 of the carousel and in a single line of the body ("I just finished [MIT course]"), not in the headline.
2. **Frame the cert as the catalyst, not the credential.** "I took [MIT course] and immediately put it to work on a real operations problem" reads way better than "I'm proud to have completed..."
3. **Tag the professors in the follow-up comment**, not the OP. Same algorithm reasoning as institution tags. Their teaching is the connection — the model is the thank-you.
4. **One unified post**, not two. Don't drop the cert today and the model next week — you'll burn the algorithm boost twice for less reach. One post, one moment, double the proof.

## LinkedIn primary post — bundled version (recommended)

**Carousel order (5 images):** (1) Live 3D scene mid-day with vents open, (2) MIT certificate, (3) Plant growth time-lapse strip clone → late flower, (4) HUD overlay close-up showing the science labels, (5) Bibliography page from CITATIONS.md.

> Two weeks ago I started a side project. Today I'm releasing it free, MIT license, no signup.
>
> It's a cannabis greenhouse decision-support model — 3D live simulation, yield projection, HVAC sizing, ventilation physics, plant growth on a 24-hour clock. Built solo with Claude Opus as a paired-coding agent. ~9,000 lines of TypeScript. 128 passing tests. Every coefficient traceable to a peer-reviewed source.
>
> I just finished MIT's [course name — e.g., Applied Generative AI / xPRO Designing AI Products] program (cert in slide 2) and put the agentic-AI workflow straight to work on a real operations problem at my cannabis brand. The course taught me how to think about agents, tool-use loops, and frontier-model coordination. The model is what those skills look like applied in production.
>
> What's in the model:
> → Yield curve from Rodriguez-Morrison 2021 (Guelph)
> → Photosynthesis Topt from Chandra 2008 (Mississippi)
> → Stack-effect ventilation from ASAE EP406.4 / ASHRAE
> → Greenhouse climate energy balance from Bot 1983 (Wageningen / KASPRO lineage)
> → Vapor-pressure / wet-bulb from Tetens & Stull 2011 (UBC)
> → Atmospheric sky scattering from Hosek-Wilkie 2012 (Charles University)
> → Pathogen pressure thresholds from Penn State + UMass + Punja (SFU)
> → Climate data live from NASA POWER + Open-Meteo + NOAA NWS
>
> The premise: most cannabis cultivation tooling is vendor pseudo-science. I wanted decision-support I'd actually trust. Now any operator can fork it, plug in their facility, and get the same answers — for free, in a browser, no install.
>
> [DEMO LINK]
> [GITHUB LINK]
>
> Outputs are screening-level — they don't replace a sealed CFD run before a real capex commit. But two weeks + a frontier coding agent can now ship what was a $30-50K consulting deliverable a year ago. That's the part of this I think matters most.
>
> If you're in cultivation, controlled-environment ag, AI engineering, or cannabis ops — clone it, break it, send a PR.

**First comment (post 30 minutes after the OP, when engagement velocity peaks):**

> Tagging the institutions whose research is built into this — every coefficient and equation traces back to your published work. Bibliography in the repo at /CITATIONS.md.
>
> @University of Guelph @University of Mississippi @Wageningen University & Research @ASABE @ASHRAE @UMass Amherst @Penn State Extension @Simon Fraser University @University of British Columbia @Charles University Prague @NASA @NOAA
>
> And a real thank-you to my MIT professors who taught me the foundations of how to actually work with frontier AI agents — not just prompt them, but design tool-use loops, evaluate outputs, and coordinate them on real problems. @[professor 1] @[professor 2] @[professor 3]. The skills you taught are the difference between AI as a toy and AI as a serious engineering partner. This model is the proof those skills compound.
>
> @MIT @MIT Sloan / @MIT Schwarzman College of Computing [whichever applies]

## The principles behind the play (so you can adapt)

**Hormozi works for B2B ops too**: the play is "give value so much greater than what's normal that they have to come ask what else you have." Open-sourcing a $20-50k consulting deliverable for free is a genuine asymmetric gift in the cannabis greenhouse space. People will reach out.

**But also**: the give-away has to be _ungated_. No email capture. No "sign up to download." If you're going to do free, do free.

**Tag your real teachers, not just famous people**. The MIT professors who actually taught you something care way more than a celebrity tag. Their share is also worth more — their networks are calibrated.

**Don't lead with credentials, lead with the artifact**. Most LinkedIn posts open with "I'm proud to share..." Don't. Open with what people will see and feel in 3 seconds.

**Single CTA**. The whole post should drive to one action: clone the repo. Not "DM me," not "comment for the link," not "follow for more." Make the action one tap.

## Variations / extensions

- **YC founder Slack** — if you're a YC alum or know one, this post is a perfect fit for their internal feeds. Different network, higher signal.
- **MJBizDaily / Marijuana Venture trade pubs** — pitch a 600-word op-ed: "I built our greenhouse decision model in 2 weeks with AI. Here's what I learned about cannabis ops that I didn't expect."
- **Conference submission** — controlled-environment ag conferences (CEA Summit, Indoor Ag-Con) accept 10-min lightning talks. The 3D model is a perfect demo.
- **University course cold-DM** — the MIT, Cornell, Guelph, Wageningen ag programs all teach undergrads modeling courses. Your repo is real-world reference material — DM the course staff.

## What NOT to do

- Don't pre-announce. The launch _is_ the announcement.
- Don't write "this is just MVP, more coming." Ship it as if it's done. (Iterating in public = good. Apologizing in public = bad.)
- Don't run paid promotion on day 1. Organic reach on a quality-tagged post is significantly higher than boosted reach for the same budget.
- Don't reply to negative comments defensively. "Good catch — added to the next version" wins; arguing loses.
