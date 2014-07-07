require 'yaml'

travis_config = {
  "js_compressor" => "uglifier",
   "css_compressor" => "sass",
   "gzip" => [ "text/css", "application/javascript" ]
 }

config = YAML.load_file('_config.yml')
config['assets'] = config['assets'].merge(travis_config)

File.open('_config.yml','w') do |handler|
   handler.write config.to_yaml
end
