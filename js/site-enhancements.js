(function () {
    'use strict';

    var ready = function (callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback);
        } else {
            callback();
        }
    };

    var escapeRegExp = function (value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    var stripHtml = function (value) {
        var wrapper = document.createElement('div');
        wrapper.innerHTML = value;
        return (wrapper.textContent || wrapper.innerText || '').replace(/\s+/g, ' ').trim();
    };

    var normalize = function (value) {
        return value.replace(/\s+/g, ' ').trim().toLowerCase();
    };

    var appendHighlightedText = function (parent, text, keywords) {
        if (!text) {
            return;
        }

        var pattern = keywords
            .filter(Boolean)
            .sort(function (a, b) {
                return b.length - a.length;
            })
            .map(escapeRegExp)
            .join('|');

        if (!pattern) {
            parent.appendChild(document.createTextNode(text));
            return;
        }

        var matcher = new RegExp(pattern, 'gi');
        var cursor = 0;
        var match;

        while ((match = matcher.exec(text)) !== null) {
            if (match.index > cursor) {
                parent.appendChild(document.createTextNode(text.slice(cursor, match.index)));
            }

            var emphasis = document.createElement('em');
            emphasis.className = 'search-keyword';
            emphasis.textContent = match[0];
            parent.appendChild(emphasis);
            cursor = match.index + match[0].length;
        }

        if (cursor < text.length) {
            parent.appendChild(document.createTextNode(text.slice(cursor)));
        }
    };

    var renderSearchResults = function (result, entries, value) {
        result.innerHTML = '';

        var query = normalize(value);
        if (!query) {
            return;
        }

        var keywords = query.split(/[\s-]+/).filter(Boolean);
        var matches = entries.filter(function (entry) {
            var searchable = normalize(entry.title + ' ' + entry.content);
            return keywords.every(function (keyword) {
                return searchable.indexOf(keyword) !== -1;
            });
        });

        var summary = document.createElement('p');
        summary.className = 'search-result-summary';
        summary.textContent = '共找到 ' + matches.length + ' 条结果';
        result.appendChild(summary);

        if (matches.length === 0) {
            var empty = document.createElement('p');
            empty.className = 'search-empty';
            empty.textContent = '没有找到相关文章，换个关键词试试。';
            result.appendChild(empty);
            return;
        }

        var list = document.createElement('ul');
        list.className = 'search-result-list';

        matches.forEach(function (entry) {
            var item = document.createElement('li');
            var link = document.createElement('a');
            link.className = 'search-result-title';
            link.href = entry.url;
            link.textContent = entry.title;
            item.appendChild(link);

            var content = entry.content.replace(/\s+/g, ' ').trim();
            var normalizedContent = content.toLowerCase();
            var firstIndex = -1;
            keywords.some(function (keyword) {
                var index = normalizedContent.indexOf(keyword);
                if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
                    firstIndex = index;
                }
                return firstIndex === 0;
            });

            if (content) {
                var snippet = document.createElement('p');
                snippet.className = 'search-result';
                var start = firstIndex > 45 ? firstIndex - 45 : 0;
                var excerpt = content.slice(start, start + 150);

                if (start > 0) {
                    snippet.appendChild(document.createTextNode('...'));
                }
                appendHighlightedText(snippet, excerpt, keywords);
                if (start + 150 < content.length) {
                    snippet.appendChild(document.createTextNode('...'));
                }
                item.appendChild(snippet);
            }

            list.appendChild(item);
        });

        result.appendChild(list);
    };

    var setupSearch = function () {
        var input = document.getElementById('searchInput');
        var result = document.getElementById('searchResult');
        if (!input || !result) {
            return;
        }

        input.setAttribute('aria-label', '搜索文章');
        result.setAttribute('aria-live', 'polite');
        var entries = [];
        var loadPromise = fetch('/search.xml', { credentials: 'same-origin' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Unable to load search index');
                }
                return response.text();
            })
            .then(function (xmlText) {
                var xml = new DOMParser().parseFromString(xmlText, 'application/xml');
                entries = Array.prototype.map.call(xml.querySelectorAll('entry'), function (entry) {
                    var title = entry.querySelector('title');
                    var content = entry.querySelector('content');
                    var url = entry.querySelector('url');
                    return {
                        title: title ? title.textContent.trim() : '',
                        content: content ? stripHtml(content.textContent) : '',
                        url: url ? url.textContent.trim() : '#'
                    };
                }).filter(function (entry) {
                    return entry.title && entry.url;
                });
            })
            .catch(function () {
                result.innerHTML = '<p class="search-empty">搜索索引暂时不可用，请稍后再试。</p>';
            });

        /*
         * The generated theme also installs a search listener. Capture the
         * event here so user input is rendered through text nodes instead of
         * interpolated HTML.
         */
        document.addEventListener('input', function (event) {
            if (event.target !== input) {
                return;
            }
            event.stopImmediatePropagation();
            loadPromise.then(function () {
                renderSearchResults(result, entries, input.value);
            });
        }, true);
    };

    var setupAccessibility = function () {
        document.body.classList.add('site-enhanced');

        var viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
            viewport.setAttribute(
                'content',
                viewport.getAttribute('content').replace('user-scalable=no', 'user-scalable=yes')
            );
        }

        var labels = [
            ['.sidenav-trigger', '打开导航菜单'],
            ['a.modal-trigger', '搜索文章'],
            ['#searchModal .modal-close', '关闭搜索'],
            ['a[onclick*="switchNightMode"]', '切换深色模式'],
            ['#backTop a', '返回顶部'],
            ['#floating-toc-btn .btn-floating', '打开文章目录']
        ];

        labels.forEach(function (item) {
            document.querySelectorAll(item[0]).forEach(function (element) {
                element.setAttribute('aria-label', item[1]);
            });
        });

        document.querySelectorAll('.sidenav-trigger').forEach(function (trigger) {
            trigger.setAttribute('aria-controls', 'mobile-nav');
            trigger.setAttribute('aria-expanded', 'false');
        });

        document.querySelectorAll('img').forEach(function (image) {
            image.setAttribute('decoding', 'async');
            if (!image.closest('.mobile-head') && !image.classList.contains('logo-img')) {
                image.setAttribute('loading', 'lazy');
            }
        });

        document.querySelectorAll('a[target="_blank"], #articleContent a').forEach(function (link) {
            link.setAttribute('rel', 'noopener noreferrer');
        });
    };

    var setupKeyboardAndModal = function () {
        var input = document.getElementById('searchInput');
        if (!input) {
            return;
        }

        document.addEventListener('click', function (event) {
            var trigger = event.target.closest('a.modal-trigger');
            if (trigger) {
                window.setTimeout(function () {
                    input.focus();
                }, 120);
            }
        });

        document.addEventListener('keydown', function (event) {
            var target = event.target;
            var isTyping = target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            );

            if (event.key === '/' && !isTyping) {
                event.preventDefault();
                var trigger = document.querySelector('a.modal-trigger');
                if (trigger) {
                    trigger.click();
                    window.setTimeout(function () {
                        input.focus();
                    }, 120);
                }
            }

            if (event.key === 'Escape') {
                var modal = document.getElementById('searchModal');
                if (modal && modal.classList.contains('open') && window.M) {
                    var instance = M.Modal.getInstance(modal);
                    if (instance) {
                        instance.close();
                    }
                }
            }
        });
    };

    var setupMobileToc = function () {
        var tocButton = document.querySelector('#floating-toc-btn .btn-floating');
        var tocAside = document.getElementById('toc-aside');
        var tocContent = document.getElementById('toc-content');
        var mainContent = document.getElementById('main-content');
        if (!tocButton || !tocAside || !tocContent || !tocContent.children.length) {
            if (tocButton && tocAside) {
                document.getElementById('floating-toc-btn').style.display = 'none';
            }
            return;
        }

        if (window.innerWidth <= 992) {
            tocAside.classList.remove('expanded');
        }

        tocButton.setAttribute('aria-expanded', 'false');
        tocButton.addEventListener('click', function () {
            var isOpen = tocAside.classList.contains('expanded');
            tocButton.setAttribute('aria-expanded', String(isOpen));
            if (window.innerWidth <= 992) {
                tocAside.classList.toggle('mobile-toc-open', isOpen);
            }
        });

        tocContent.addEventListener('click', function (event) {
            if (window.innerWidth <= 992 && event.target.closest('a')) {
                tocAside.classList.remove('expanded', 'mobile-toc-open');
                tocButton.setAttribute('aria-expanded', 'false');
            }
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && tocAside.classList.contains('mobile-toc-open')) {
                tocAside.classList.remove('expanded', 'mobile-toc-open');
                tocButton.setAttribute('aria-expanded', 'false');
                tocButton.focus();
            }
        });

        window.addEventListener('resize', function () {
            if (window.innerWidth > 992) {
                tocAside.classList.remove('mobile-toc-open');
                tocAside.classList.add('expanded');
                tocAside.style.display = '';
                if (mainContent) {
                    mainContent.classList.add('l9');
                }
                tocButton.setAttribute('aria-expanded', 'true');
            } else if (!tocAside.classList.contains('mobile-toc-open')) {
                tocAside.classList.remove('expanded');
            }
        });
    };

    ready(function () {
        setupAccessibility();
        setupSearch();
        setupKeyboardAndModal();
        setupMobileToc();
    });
})();
(function () {
  'use strict';
  var ready = function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };
  var isTyping = function (el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  };
  var setupReadingProgress = function () {
    if (!document.getElementById('articleContent')) return;
    var bar = document.createElement('div');
    bar.id = 'reading-progress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', '阅读进度');
    bar.innerHTML = '<span></span>';
    document.body.appendChild(bar);
    var update = function () {
      var article = document.getElementById('articleContent');
      var rect = article.getBoundingClientRect();
      var total = article.scrollHeight - window.innerHeight;
      var progress = total > 0 ? Math.min(100, Math.max(0, (-rect.top / total) * 100)) : 100;
      bar.firstElementChild.style.width = progress + '%';
      bar.setAttribute('aria-valuenow', Math.round(progress));
    };
    window.addEventListener('scroll', update, {passive: true});
    window.addEventListener('resize', update);
    update();
  };
  var setupCommandPalette = function () {
    var modal = document.createElement('div');
    modal.id = 'command-palette';
    modal.innerHTML = '<div class="command-palette__backdrop"></div>' +
      '<div class="command-palette__dialog" role="dialog" aria-modal="true" aria-label="命令面板">' +
      '<input type="search" placeholder="输入命令或搜索文章…" aria-label="命令面板搜索">' +
      '<div class="command-palette__hint">↑ ↓ 选择 · Enter 打开 · Esc 关闭</div>' +
      '<div class="command-palette__items"></div></div>';
    document.body.appendChild(modal);
    var input = modal.querySelector('input'), items = modal.querySelector('.command-palette__items');
    var commands = [
      ['搜索文章', '打开站内搜索', function () { var t=document.querySelector('a.modal-trigger'); if(t)t.click(); }],
      ['返回首页', 'Home', function () { location.href = '/'; }],
      ['文章归档', 'Archives', function () { location.href = '/archives/'; }],
      ['标签', 'Tags', function () { location.href = '/tags/'; }],
      ['分类', 'Categories', function () { location.href = '/categories/'; }]
    ];
    var selected = 0;
    var render = function (query) {
      items.innerHTML = '';
      var filtered = commands.filter(function (c) {
        return !query || (c[0] + ' ' + c[1]).toLowerCase().indexOf(query.toLowerCase()) !== -1;
      });
      filtered.forEach(function (c, i) {
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'command-palette__item' + (i === selected ? ' is-selected' : '');
        el.innerHTML = '<strong></strong><span></span>';
        el.children[0].textContent = c[0]; el.children[1].textContent = c[1];
        el.addEventListener('click', function () { close(); c[2](); });
        items.appendChild(el);
      });
      if (selected >= filtered.length) selected = Math.max(0, filtered.length - 1);
      return filtered;
    };
    var open = function () { modal.classList.add('is-open'); selected=0; input.value=''; render(''); setTimeout(function(){input.focus();},20); };
    var close = function () { modal.classList.remove('is-open'); };
    input.addEventListener('input', function(){ selected=0; render(input.value); });
    input.addEventListener('keydown', function(e){
      var list = render(input.value);
      if (e.key === 'ArrowDown') { e.preventDefault(); selected=Math.min(selected+1,list.length-1); render(input.value); }
      if (e.key === 'ArrowUp') { e.preventDefault(); selected=Math.max(selected-1,0); render(input.value); }
      if (e.key === 'Enter' && list[selected]) { e.preventDefault(); close(); list[selected][2](); }
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    modal.querySelector('.command-palette__backdrop').addEventListener('click', close);
    document.addEventListener('keydown', function(e){
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    });
  };
  var setupKeyboardNavigation = function () {
    var prev = document.querySelector('.prev-next .left-badge') && document.querySelector('.prev-next .left-badge').closest('.article');
    var next = document.querySelector('.prev-next .right-badge') && document.querySelector('.prev-next .right-badge').closest('.article');
    var prevLink = prev && prev.querySelector('a[href]'), nextLink = next && next.querySelector('a[href]');
    document.addEventListener('keydown', function(e){
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'j' && nextLink) { e.preventDefault(); nextLink.click(); }
      if (e.key === 'k' && prevLink) { e.preventDefault(); prevLink.click(); }
      if (e.key === 'g') document.body.dataset.pendingKey = 'g';
      else if (document.body.dataset.pendingKey === 'g') {
        document.body.dataset.pendingKey = '';
        if (e.key === 'h') location.href='/';
        if (e.key === 'a') location.href='/archives/';
        if (e.key === 't') location.href='/tags/';
      } else document.body.dataset.pendingKey = '';
    });
  };
  var setupCodeBlocks = function () {
    document.querySelectorAll('#articleContent pre').forEach(function(pre){
      if (pre.dataset.enhanced || (pre.parentElement && pre.parentElement.querySelector('.code_copy'))) return;
      pre.dataset.enhanced = '1';
      var button = document.createElement('button');
      button.type='button'; button.className='code-copy-enhanced'; button.textContent='复制';
      button.addEventListener('click', function(){
        var code = pre.querySelector('code');
        if (!code) return;
        navigator.clipboard.writeText(code.innerText).then(function(){
          button.textContent='已复制'; pre.classList.add('copy-success');
          setTimeout(function(){button.textContent='复制';pre.classList.remove('copy-success');},1200);
        }).catch(function(){button.textContent='复制失败';setTimeout(function(){button.textContent='复制';},1200);});
      });
      pre.appendChild(button);
    });
  };
  var setupPwa = function () {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      window.addEventListener('load', function(){ navigator.serviceWorker.register('/sw.js').catch(function(){}); });
    }
  };
  ready(function(){
    setupReadingProgress();
    setupCommandPalette();
    setupKeyboardNavigation();
    setupCodeBlocks();
    setupPwa();
  });
})();