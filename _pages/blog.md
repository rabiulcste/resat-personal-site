---
layout: default
title: Writing
permalink: "/blog/"
---

<div class="media-lab-blog-container">
  <header class="blog-hero">
    <h1 class="blog-hero-title">Writing</h1>
    <p class="blog-hero-subtitle">Essays and commentary on platforms, power, feminist politics, and technology in the Global South</p>
    <p class="blog-note">For peer-reviewed work and manuscripts, see <a href="{{ site.github.url }}/research">Research Projects</a>.</p>
  </header>
  
  {% if site.posts.size > 0 %}
  <div class="media-lab-blog-grid">
    {% for post in site.posts %}
    <article class="media-lab-blog-card">
      {% if post.thumbnail %}
      <div class="blog-card-image">
        <a href="{{ site.github.url }}{{ post.url }}">
          <img src="{{ site.github.url }}/{{ post.thumbnail }}" alt="{{ post.title }}"/>
          <div class="image-overlay"></div>
        </a>
      </div>
      {% else %}
      <div class="blog-card-image-placeholder">
        <svg width="100%" height="100%" viewBox="0 0 400 250" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="blogGrad{{ forloop.index }}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#94a8c9;stop-opacity:0.2" />
              <stop offset="100%" style="stop-color:#7670a8;stop-opacity:0.2" />
            </linearGradient>
          </defs>
          <rect width="400" height="250" fill="url(#blogGrad{{ forloop.index }})"/>
        </svg>
      </div>
      {% endif %}
      <div class="blog-card-content">
        <div class="blog-card-meta">
          <time class="blog-card-date">{{ post.date | date: "%B %-d, %Y" }}</time>
          {% if post.tags %}
          <div class="blog-card-tags">
            {% for tag in post.tags limit: 2 %}
            <span class="blog-tag">{{ tag }}</span>
            {% endfor %}
          </div>
          {% endif %}
        </div>
        <h2 class="blog-card-title">
          <a href="{{ site.github.url }}{{ post.url }}">{{ post.title }}</a>
        </h2>
        <div class="blog-card-excerpt">
          {{ post.excerpt | strip_html | truncatewords: 40 }}
        </div>
        <a href="{{ site.github.url }}{{ post.url }}" class="blog-card-link">
          Read Article →
        </a>
      </div>
    </article>
    {% endfor %}
  </div>
  {% else %}
  <div class="blog-empty">
    <p>No posts yet. Check back soon!</p>
  </div>
  {% endif %}
</div>

