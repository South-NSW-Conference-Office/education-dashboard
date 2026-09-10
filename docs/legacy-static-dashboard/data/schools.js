// School registry — the single place that says which boards exist and how they link together.
// `id` is used in URLs (#/finance/bcc), storage keys and data files (data/finance-<id>.js).
// `dbKey` matches the `theme` code used by rows in the Weekly Databoard data.
window.SNSW_SCHOOLS = [
  { id: "bcc",     dbKey: "bcc", name: "Border Christian College",   short: "BCC",     loc: "Albury NSW",  colour: "#3c6f4e", type: "K–12 school" },
  { id: "ncs",     dbKey: "nar", name: "Narromine Christian School", short: "NCS",     loc: "Narromine NSW", colour: "#7a6a52", type: "K–6 school" },
  { id: "ccs",     dbKey: "ccs", name: "Canberra Christian School",  short: "CCS",     loc: "Mawson ACT",  colour: "#0D5CAB", type: "K–10 school" },
  { id: "ccs-elc", dbKey: "elc", name: "Canberra Christian ELC",     short: "CCS ELC", loc: "Mawson ACT",  colour: "#6b4f7a", type: "Early learning centre" }
];
