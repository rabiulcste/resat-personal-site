##############
#   Build    #
##############

# Generate the site
# Minify, optimize, and compress

desc "build the site"
task :build do
  system "JEKYLL_ENV=production bundle exec jekyll build --incremental"
end

##############
#   Develop  #
##############

# Useful for development
# It watches for chagnes and updates when it finds them

desc "Watch the site and regenerate when it changes"
task :watch do
  system "JEKYLL_ENV=development bundle exec jekyll serve --watch"
end

################
#   Build Gem  #
################
desc "create the gem (if needed)"
task :buildgem do
  system "JEKYLL_ENV=production bundle exec gem build starving-artist.gemspec"
end
