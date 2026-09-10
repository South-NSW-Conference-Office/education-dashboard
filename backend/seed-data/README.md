# seed-data

`schools.js` is the school registry: which boards exist, their names, locations and colours.
It is the only data file kept in this repository.

The board files it sits beside — `databoard.js`, `finance-bcc.js`, `finance-ncs.js`,
`finance-ccs.js`, `finance-ccs-elc.js` — carry real South NSW Conference school figures, so
they are handed over privately instead. `npm run seed` stops with a message when they are
absent. Drop them into this folder to seed, or restore the supplied mongosh snapshot and
skip seeding altogether.
