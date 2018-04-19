InstantClick.on('change', function() {
  const $allVideos = $("iframe[src^='http://www.youtube.com']");
  const $fluidEl = $(".wrap");

  $allVideos.each(function() {
    $(this).data("aspectRatio", this.height / this.width).removeAttr("height").removeAttr("width");
  });

  $(window).resize(function() {
    const newWidth = $fluidEl.width();
    $allVideos.each(function() {
      const $el = $(this);
      $el.width(newWidth).height(newWidth * $el.data("aspectRatio"));
    });

  }).resize();
});
