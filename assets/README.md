# SnipeGolf — assets

Drop `snipe-logo.png` (or `.svg`) here to replace the inline `S` mark + serif
wordmark used in every header.

When present, swap the `<a class="brand">…</a>` block in each HTML file's
header for:

```html
<a class="brand" href="/index.html" aria-label="SnipeGolf home">
  <img src="/assets/snipe-logo.png" alt="SnipeGolf">
</a>
```

The CSS already constrains `.brand img { height: 28px; width: auto; }`.
