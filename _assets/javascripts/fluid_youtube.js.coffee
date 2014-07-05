$ ->
  $allVideos = $("iframe[src^='http://www.youtube.com']")
  $fluidEl = $(".wrap")

  $allVideos.each ->
    $(@).data("aspectRatio", @height / @width).removeAttr("height").removeAttr "width"
    return

  $(window).resize(->
    newWidth = $fluidEl.width()
    $allVideos.each ->
      $el = $(this)
      $el.width(newWidth).height newWidth * $el.data("aspectRatio")
      return

    return
  ).resize()
  return
