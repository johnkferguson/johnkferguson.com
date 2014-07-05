guard :bundler do
  watch('Gemfile')
end

guard 'jekyll-plus',
  config: %w(_octopress.yml _config.yml),
  extensions: %w(md markdown html css scss sass js coffee),
  serve: true do
  watch /_pages/
  watch /_posts/
  watch /_includes/
  watch /_assets/
  watch /index.html/
  ignore /^_site/
end

guard 'livereload' do
  watch /.*/
end
