guard 'jekyll-plus', serve: true, config: %w(_octopress.yml _config.yml) do
  watch /.*/
  ignore /^_site/
end

guard 'livereload' do
  watch /.*/
end

guard :bundler do
  watch('Gemfile')
end
