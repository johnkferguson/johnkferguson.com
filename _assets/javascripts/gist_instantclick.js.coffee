# https://github.com/reed/turbolinks-compatibility/issues/18
GistInstantClick =
  get_gist: ($gist) ->
    callback_name = "c#{Math.random().toString(36).substring(7)}"

    window[callback_name] = (gist_data) ->
      window[callback_name] = undefined
      try
        delete window[callback_name]
      catch e
      html = '<link rel="stylesheet" href="'encodeURI(gist_data.stylesheet)'"></link>'
      html += gist_data.div
      $gist.html html
      script.parentNode.removeChild script

    script = document.createElement "script"
    script.setAttribute "src", [
      $gist.data("src"),
      $.param(
        callback: callback_name
        file: $gist.data("file") || ""
      )
    ].join "?"

    document.body.appendChild script

  load: ->
    $this = @
    $(".embedded-gist").each ->
      $this.get_gist $(@)

InstantClick.on 'change', ->
  GistInstantClick.load()
