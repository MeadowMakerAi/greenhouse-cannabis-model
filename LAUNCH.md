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
| Weekend | Reply to every comment, especially from tagged institutions. The replies are where the connections form. |

The comment-with-tags pattern is the real trick. LinkedIn down-ranks posts with > 3-4 mentions in the OP. You get the same exposure with no penalty by tagging in a follow-up comment, and the comment notification is what pulls the alumni in.

## LinkedIn primary post (template — edit voice to match yours)

> 9 days ago I started a side project: model my company's greenhouse so we could decide what to actually build. Cannabis cultivation is full of vendor pseudo-science and back-of-envelope claims. I wanted decision-support I'd actually trust.
>
> Today I'm open-sourcing it. Built solo with Claude as a paired-coding agent. ~9,000 lines of TypeScript, 128 passing unit tests, every coefficient traceable to a peer-reviewed source.
>
> What it does:
> → 3D live-simulation greenhouse on a 24-hour clock with sun position, plant growth, atrium ridge vents, light schedule, and HVAC
> → Yield projection from Rodriguez-Morrison 2021 (Guelph) DLI response
> → Photosynthesis Topt from Chandra 2008 (Mississippi)
> → Stack-effect natural ventilation from ASAE EP406.4 / ASHRAE
> → Greenhouse climate energy balance from Bot 1983 (Wageningen)
> → Vapor-pressure / wet-bulb from Tetens & Stull 2011 (UBC)
> → Atmospheric scattering for the live sky from Hosek-Wilkie 2012 (Charles University)
> → Climate data live from NASA POWER + Open-Meteo + NOAA NWS
> → Pathogen pressure thresholds from Penn State + UMass extension + Punja (SFU)
>
> Free. MIT license. No signup. No backend. Click the link, type a scenario, watch the model live.
>
> [DEMO LINK]
> [GITHUB LINK]
>
> Built with Anthropic Claude Opus 4.7. The model itself is decision-support — every output is screening-level and shouldn't replace a sealed CFD run before a real capex decision. But it's a tour through what one person + a frontier coding agent can actually ship in two weeks.
>
> If you're in cannabis ops, controlled-environment ag, or just curious how AI-paired engineering looks in 2026 — clone it, break it, send a PR.

**First comment (post 30 minutes after the OP):**

> Tagging the institutions whose research is built into this — every coefficient and equation traces back to your published work. Bibliography in the repo at /CITATIONS.md.
>
> @University of Guelph @University of Mississippi @Wageningen University & Research @ASABE @ASHRAE @UMass Amherst @Penn State Extension @Simon Fraser University @University of British Columbia @Charles University Prague @NASA @NOAA @MIT
>
> Special thank you to my MIT professors who taught me the AI fundamentals I used to actually paired-code this thing into existence — @[professor 1] @[professor 2] @[professor 3]. The skills you taught are what made working with a frontier model on a real engineering problem feel natural.

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
