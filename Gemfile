source "https://rubygems.org"

# Jekyll
gem "jekyll", "~> 3.9"

# Jekyll plugins
gem "jekyll-feed", "~> 0.12"

# Markdown parser for GFM (GitHub Flavored Markdown)
gem "kramdown-parser-gfm"

# Build tools
gem "rake", "~> 12.3"

# Ruby 3.4+ compatibility - base64, logger, and bigdecimal removed from default gems
gem "base64"
gem "logger"
gem "bigdecimal"

# Windows does not include zoneinfo files, so bundle the tzinfo-data gem
# and associated library.
platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

# Performance and security
gem "wdm", "~> 0.1.1", :platforms => [:mingw, :x64_mingw, :mswin]

