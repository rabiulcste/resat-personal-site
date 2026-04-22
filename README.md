# Resat Amin — Personal Website

Personal website of Resat Amin, Ph.D. student in the Department of Communication at the University of Massachusetts Amherst. Research focuses on digital platforms, feminist activism, AI representation, and technology in the Global South.

Live at: [resatamin.netlify.app](https://resatamin.netlify.app)

## Pages

- **Home** — hero introduction with research themes
- **About** — background, research approach, education, experience, and media work
- **Research** — current projects and full research portfolio
- **Writing** — essays and commentary published in various outlets
- **Contact** — direct email contact

## Local Development

### Prerequisites

- Ruby 3.3+
- Bundler

### Setup

```bash
bundle install
bundle exec jekyll serve
```

Visit [http://localhost:4000](http://localhost:4000)

## Tech

- [Jekyll](https://jekyllrb.com/) static site generator
- Sass for styling (single consolidated `_main.scss`)
- Fonts: Space Grotesk, Source Serif 4, IBM Plex Mono (Google Fonts)
- Deployed on [Netlify](https://netlify.com)

## Contact Form

Uses [Formspree](https://formspree.io). To activate, add your form endpoint to `_config.yml`:

```yaml
contact_form: "https://formspree.io/YOUR_FORM_ID"
```
