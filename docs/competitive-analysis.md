# Amble — Competitive Analysis

_Last updated: 2026-07-01. Verified against live sources; ignores marketing claims._

## Competitor Cards

### 1. Mapstr
- **Value prop:** Personal map of your saved places, with tags and social discovery from other Mapstr users.
- **How places are added:** Manual search (name / address / coordinates) via `+` button; account-linked imports from Foursquare, Swarm, Google Maps. Instagram connection exists but **only surfaces public Mapstr users' feeds — it does NOT auto-extract places from Instagram posts or screenshots.** A reel mentioning 5 restaurants = 5 manual searches.
- **Features:** Tags, color codes, opening hours / contact auto-fill from other users' entries, geofenced alerts, curated `mapStore` maps, web app.
- **Pricing:** Free up to 300 places; **Mapstr Plus $80/yr** (unlimited + partner perks).
- **Weakness Amble exploits:** The "Instagram integration" is fake — users still manually retype every place. Amble replaces N manual searches with one screenshot upload.

### 2. Beli
- **Value prop:** Ranked personal restaurant list built by pairwise comparison ("better than X, worse than Y").
- **How places are added:** Search-by-name only, then triage into Been / Want to Try, then head-to-head comparisons to slot into your ranking.
- **Features:** Ranked lists, friend feed, Match Score with friends, Taste Profile, streaks & yearly goals, bookmarked bucket list, map view.
- **Pricing:** Free. Invite-only **Beli Supper Club** subscription (NYC-only, events + premium features).
- **Weakness Amble exploits:** Restaurants only — no bars, museums, activities, viewpoints. And still 100% manual entry; the Insta-to-list gap is wide open.

### 3. Google Saved Lists / Apple Guides
- **Value prop:** Free, native bookmark folders inside the maps app you already use.
- **How places are added:** Tap a pin → "Save" → pick list. No share-sheet from Instagram; no screenshot import. Google lists support collaborators; Apple Guides sync via iCloud but no real-time co-edit.
- **Features:** Basic lists, sharing, collaboration (Google), theme guides (Apple), turn-by-turn nav baked in.
- **Pricing:** Free.
- **Weakness Amble exploits:** Zero capture flow from social media. Lists are dumb buckets — no notes tied to the source post, no vision extraction, no "why did I save this." Also: Google/Apple lists are graveyards — high save rate, near-zero recall.

### 4. Wanderlog
- **Value prop:** Collaborative multi-day trip planner with itineraries, budgets, and reservation tracking.
- **How places are added:** Manual search on map; auto-imports **flight/hotel reservations** by scanning Gmail; export to Google Maps.
- **Features:** Day-by-day itinerary, route optimization, expense splitting, offline access, AI trip-planning assistant (Pro), real-time collab.
- **Pricing:** Free tier; **Pro $39.99/yr** (AI assistant, route opt, unlimited attachments, Gmail scan).
- **Weakness Amble exploits:** Trip-scoped, not journal-scoped. Overkill for "I saw a cute cafe on Insta and want to remember it." No Instagram capture. Heavy UX aimed at planners, not saviours.

### 5. Postcard (postcardapp.com / App Store: "Postcard – Travel Maps & Recs")
- **Value prop:** Social travel journal — discover places from creators, save curated recs, share your own postcards.
- **How places are added:** iOS share sheet from social/web, manual add, Google Maps link import, browsing 60M-place directory. **Sharing TO Instagram Stories is supported; extracting FROM Instagram screenshots is not.**
- **Features:** Curated brand/creator lists, TikTok video embeds on venues, Google review pull-through, city/country lists, follows.
- **Pricing:** Free (no IAP listed as of v1.1.16, May 2026).
- **Weakness Amble exploits:** Social-first — assumes you want followers and curated feeds. A private user just wanting their own list has to swim through a discovery product. No vision extraction from screenshots; share sheet requires the post URL, which fails for stories/DMs/screenshots.

---

## Synthesis

### Unique angle for Amble
- **Vision-LLM extraction from screenshots** is the only ingestion path none of the 5 above ship. Screenshots work for stories, DMs, reels, and cross-posted content where the share sheet + URL flow breaks. (Note: an emerging cohort — Plotline, Stashed, JoySpot, SpotFetch, Via — is chasing share-sheet extraction, but still not screenshot-first vision.)
- **Multi-place extraction from a single input** (a reel screenshot listing 5 spots → 5 pins) — Mapstr, Beli, Google, Apple all require N manual searches.
- **Private journal by default, no social layer** — Postcard and Beli push a feed; Mapstr nudges you toward public users; Amble is a lockbox for your own future self.

### Feature Parity

| Feature | Amble | Mapstr | Beli | Google/Apple | Wanderlog | Postcard |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Screenshot → auto-extract place | Yes | No | No | No | No | No |
| Share sheet from Instagram | Planned | No* | No | No | No | Yes |
| Multi-place extraction per input | Yes | No | No | No | No | No |
| All place types (not just food) | Yes | Yes | No | Yes | Yes | Yes |
| Works fully offline / private | Yes | Partial | No | Yes | Pro | No |
| Zero-social, single-user default | Yes | No | No | Yes | No | No |
| Free & unlimited saves | Yes | No (300 cap) | Yes | Yes | Yes (basic) | Yes |
| Trip itinerary building | No | No | No | No | Yes | No |

<sub>*Mapstr "connects" to Instagram for social discovery but does not extract places from posts.</sub>

### Positioning statement
> **Amble is the only travel-save app where the input is a screenshot, not a search bar — turning every Instagram reco into a pin on your private map without a single tap of manual entry.**

---

**Sources:** [Mapstr FAQ](https://en.mapstr.com/faq) · [Beli App](https://beliapp.com/) · [Wanderlog Pricing 2026](https://monkeyeatingmango.com/blog/wanderlog-pricing-2026/) · [Postcard App Store](https://apps.apple.com/us/app/postcard-travel-maps-recs/id1607191398) · [Plotline: Best Apps to Save Locations from TikTok/IG](https://getplotline.app/blog/best-apps-save-locations-tiktok-instagram) · [Google Maps Lists help](https://support.google.com/maps/answer/7280933) · [Beli Wikipedia](https://en.wikipedia.org/wiki/Beli_(app))
