
const getModels = (req, res) => {
  const models = [
    { id: "agnes-2.5-flash", name: "Agnes 2.5 Flash", provider: "nara" },
    { id: "agnes-3-flash", name: "Agnes 3 Flash", provider: "nara" },
    { id: "jev", name: "Jev", provider: "nara" },
    { id: "laguna-s-2.1", name: "Laguna S 2.1", provider: "nara" },
    { id: "ling-3.0-flash-fin-free", name: "Ling 3.0 Flash Fin Free", provider: "nara" },
    { id: "ling-3.0-flash-sante-free", name: "Ling 3.0 Flash Sante Free", provider: "nara" },
    { id: "longcat-2.5", name: "LongCat 2.5", provider: "nara" },
    { id: "nemotron-3-super-free", name: "Nemotron 3 Super Free", provider: "nara" },
    { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra Free", provider: "nara" },
    { id: "nemotron-3.5-lightning-free", name: "Nemotron 3.5 Lightning Free", provider: "nara" },
    { id: "space-bunny-alpha", name: "Space Bunny Alpha", provider: "nara" },
    { id: "space-bunny-alpha-bynara", name: "Space Bunny Alpha (ByNara)", provider: "nara" }
  ];

  res.json({ models });
};

module.exports = { getModels };