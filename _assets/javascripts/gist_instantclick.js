/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// https://github.com/reed/turbolinks-compatibility/issues/18
const GistInstantClick = {
  get_gist($gist) {
    const callback_name = `c${Math.random().toString(36).substring(7)}`;

    window[callback_name] = function(gist_data) {
      window[callback_name] = undefined;
      try {
        delete window[callback_name];
      } catch (e) {}
      let html = `<link rel="stylesheet" href="${encodeURI(gist_data.stylesheet)}"></link>`;
      html += gist_data.div;
      $gist.html(html);
      return script.parentNode.removeChild(script);
    };

    var script = document.createElement("script");
    script.setAttribute("src", [
      $gist.data("src"),
      $.param({
        callback: callback_name,
        file: $gist.data("file") || ""
      })
    ].join("?")
    );

    return document.body.appendChild(script);
  },

  load() {
    const $this = this;
    return $(".embedded-gist").each(function() {
      return $this.get_gist($(this));
    });
  }
};

InstantClick.on('change', () => GistInstantClick.load());
