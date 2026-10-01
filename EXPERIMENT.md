# Ambitious Experiment: CentralizedCourt

## Postponed ideas

1. **CentralizedCourt**: an ODR (Online Dispute Resolution) system inspired by Kleros,
   but simplified, with no blockchain and no economic incentives. Only whitelisted
   users can act as jurors or create cases. Users sign up by email and can have
   different roles.
   What stopped me: time, since it's a system with several parts (backend + frontend),
   and doubts about its commercial value because of the trust assumptions involved.
2. **<Idea 2>**: <description>. What stopped me: <reason>.
3. **<Idea 3>**: <description>. What stopped me: <reason>.

**Chosen idea:** CentralizedCourt.

## Scope

- **Smallest useful demonstration:** the full lifecycle of a single case:
  1. Email-based login with roles (admin, case creator, juror).
  2. The admin whitelists case creators and jurors.
  3. A case creator opens a case with a description, possible outcomes and a deadline.
  4. Jurors are drawn, either randomly or selected manually.
  5. Jurors vote before the deadline, which starts when they are drawn.
  6. The case is resolved by majority vote and the result is visible to all parties.
- **Acceptance check:** a case creator opens a case with 3 randomly drawn jurors and
  an N-hour deadline. If 2 of the 3 jurors vote "A" before the deadline, the case
  status becomes "Resolved: A". A non-whitelisted user cannot create cases or be
  drawn as a juror.
- **Stretch goal:** appeals with a larger jury, email notifications, evidence
  submission by the parties, and an audit log with each case's full history to
  mitigate the trust assumptions.

## Constraints

- **Vertical slices** (each one end to end, backend + UI):
  1. Login + roles + whitelist
  2. Create a case and see it listed
  3. Draw or assign jurors and show the deadline
  4. Vote, resolve by majority and show the result
- **Runs locally only.** No external services: the email login code/magic link is
  printed to the console or stored in the database.
- **Deterministic fixtures:** seeded users (1 admin, 2 case creators, 5 whitelisted
  jurors, 1 non-whitelisted user), a fixed seed for the random juror draw, and a short
  time to vote (2 mins) to not wait during tests.
- **Definition of done:** the acceptance check runs as an automated end-to-end test
  or script and passes. Can use timefakers to avoid waiting minutes.
- **Reserved for Day 5:** one unseen feature, kept outside the repository.
- **Fallback:** if setup or auth blocks progress beyond its allotted time, use static
  fixtures and a single local screen or CLI.

## Hypothesis

- **Old obstacle:** time. It's a multi-part system (backend + frontend), and I wasn't
  sure it made sense commercially given the trust assumptions.
- **Current hypothesis:**
  - _Technical:_ with AI-assisted development, I can build the complete flow
    (backend + frontend) in a single day, when it would previously have taken weeks.
  - _Product:_ for companies with a well-known brand that users already trust, a
    centralized ODR is good enough and simpler than a decentralized one.
- **Experiment for today:** build the smallest useful demonstration and pass the
  acceptance check, while noting where AI sped things up and where I had to make
  the decisions myself.

## Final report (to be completed at the end)

- What became possible:
- What still needed my judgment:
- What I will try next:
