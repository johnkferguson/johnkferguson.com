guard :bundler do
  watch('Gemfile')
end

group :build do
  guard 'jekyll-plus',
    config: %w(_octopress.yml _config.yml),
    extensions: %w(md markdown html css scss sass js coffee),
    serve: true do
    watch /_pages/
    watch /_posts/
    watch /_includes/
    watch /_assets/
    watch /index.html/
    watch /_config.yml/
    watch /_octopress.yml/
    ignore /^_site/
  end

  guard 'livereload' do
    watch /.*/
  end
end
