// The working copy is deliberately separate from the version attached to a session.
export function editor(container, original, report) {
  let copy = structuredClone(original);
  const el = (tag, text) => {
    let n = document.createElement(tag);
    if (text) n.textContent = text;
    return n;
  };
  const form = el("form");
  container.replaceChildren(form);
  function input(label, value, multiline = false) {
    const wrap = el("label", label),
      n = el(multiline ? "textarea" : "input");
    n.value = value ?? "";
    wrap.append(n);
    form.append(wrap);
    return n;
  }
  function select(label, entries, value) {
    let wrap = el("label", label),
      n = el("select");
    for (const [id, title] of entries) {
      let o = el("option", title);
      o.value = id;
      n.append(o);
    }
    n.value = value;
    wrap.append(n);
    form.append(wrap);
    return n;
  }
  let idx = 0,
    variant = 0;
  function paint() {
    form.replaceChildren();
    let m = copy.measures[idx],
      versions = [m, ...m.variants],
      v = versions[variant];
    let title = input("Nom du scénario", copy.title),
      ver = input("Version", copy.version),
      status = select(
        "Statut éditorial",
        ["essai", "pilote", "autorisé"].map((s) => [s, s]),
        copy.status,
      );
    let context = input("Contexte public", copy.context, true),
      measures = select(
        "Mesure",
        copy.measures.map((m, i) => [i, m.id + " · " + m.title]),
        idx,
      ),
      vs = select(
        "Texte",
        versions.map((v, i) => [i, v.id]),
        variant,
      );
    let vtitle = input("Titre du texte", v.title),
      body = input("Libellé exact", v.text, true),
      trends = input(
        "Tendances dans l’ordre des cinq dimensions, séparées par /",
        v.trends.join(" / "),
      ),
      scores = input(
        "Profils internes en demi-points doublés, entiers de −4 à +4",
        v.scores.join(" / "),
      );
    let reviewer = input("Relecture et réserves", v.review || "", true);
    function save() {
      let nums = scores.value.split("/").map((n) => Number(n.trim())),
        arrows = trends.value.split("/").map((s) => s.trim());
      if (
        nums.length !== 5 ||
        !nums.every((n) => Number.isInteger(n) && Math.abs(n) <= 4) ||
        arrows.length !== 5 ||
        !body.value.trim()
      )
        throw Error("Vérifiez le texte et les cinq valeurs du profil.");
      Object.assign(copy, {
        title: title.value.trim(),
        version: ver.value.trim(),
        context: context.value,
        status: status.value,
      });
      Object.assign(v, {
        title: vtitle.value.trim(),
        text: body.value.trim(),
        scores: nums,
        trends: arrows,
        review: reviewer.value,
      });
    }
    measures.onchange = () => {
      try {
        save();
        idx = Number(measures.value);
        variant = 0;
        paint();
      } catch (e) {
        measures.value = idx;
        report(e.message);
      }
    };
    vs.onchange = () => {
      try {
        save();
        variant = Number(vs.value);
        paint();
      } catch (e) {
        vs.value = variant;
        report(e.message);
      }
    };
    let submit = el("button", "Télécharger la nouvelle version");
    submit.type = "submit";
    form.append(submit);
    form.onsubmit = (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        save();
        let a = el("a"),
          url = URL.createObjectURL(
            new Blob([JSON.stringify(copy, null, 2)], {
              type: "application/json",
            }),
          );
        a.href = url;
        a.download = "scenario-parlement.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (e) {
        report(e.message);
      }
    };
  }
  paint();
}
