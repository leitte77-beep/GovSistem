"""Tests for HTML sanitization and XSS prevention."""


from app.core.html_sanitizer import extract_plain_text, sanitize_html


class TestScriptTagStripping:
    def test_script_tag_removed(self):
        result = sanitize_html("<p>Hello</p><script>alert('xss')</script>")
        assert "script" not in result
        assert "<p>Hello</p>" in result

    def test_script_with_content_removed(self):
        result = sanitize_html(
            "<div>Safe</div><script>document.cookie</script>"
        )
        assert "document.cookie" not in result
        assert "Safe" in result

    def test_nested_script_attempt(self):
        result = sanitize_html(
            "<p><script>evil</script>text</p>"
        )
        assert "<p>text</p>" in result


class TestIframeStripping:
    def test_iframe_removed(self):
        result = sanitize_html(
            "<p>Content</p><iframe src='http://evil.com'></iframe>"
        )
        assert "iframe" not in result

    def test_iframe_with_srcdoc_removed(self):
        result = sanitize_html(
            "<iframe srcdoc='<script>alert(1)</script>'></iframe>"
        )
        assert "iframe" not in result


class TestInlineEventHandlers:
    def test_onclick_removed(self):
        result = sanitize_html('<button onclick="alert(1)">Click</button>')
        # button is not in allowed tags, but onclick should be stripped regardless
        assert "onclick" not in result

    def test_onload_removed(self):
        result = sanitize_html('<img src="x" onerror="alert(1)">')
        assert "onerror" not in result

    def test_onmouseover_removed(self):
        result = sanitize_html('<p onmouseover="evil()">text</p>')
        assert "onmouseover" not in result

    def test_all_inline_events_stripped(self):
        events = [
            "onload", "onerror", "onclick", "ondblclick",
            "onmousedown", "onmouseup", "onmouseover",
            "onmousemove", "onmouseout", "onfocus",
            "onblur", "onkeydown", "onkeyup", "onkeypress",
            "onsubmit", "onreset", "onchange", "onselect",
        ]
        for evt in events:
            html = f"<p {evt}='evil()'>text</p>"
            result = sanitize_html(html)
            assert evt not in result, f"{evt} was not stripped"


class TestJavaScriptProtocol:
    def test_javascript_href_removed(self):
        result = sanitize_html(
            '<a href="javascript:alert(1)">link</a>'
        )
        # The a tag should be kept but href should be removed
        assert "javascript:" not in result

    def test_javascript_in_src_removed(self):
        result = sanitize_html(
            '<img src="javascript:alert(1)">'
        )
        assert "javascript:" not in result

    def test_data_href_removed(self):
        result = sanitize_html(
            '<a href="data:text/html,<script>alert(1)</script>">link</a>'
        )
        assert "data:" not in result


class TestDangerousTags:
    def test_object_removed(self):
        result = sanitize_html(
            "<object data='http://evil.com'></object>"
        )
        assert "object" not in result

    def test_embed_removed(self):
        result = sanitize_html("<embed src='http://evil.com'>")
        assert "embed" not in result

    def test_form_removed(self):
        result = sanitize_html(
            "<form action='http://evil.com'><input type='submit'></form>"
        )
        assert "form" not in result

    def test_style_tag_removed(self):
        result = sanitize_html(
            "<style>body { background: red; }</style>"
        )
        assert "style" not in result

    def test_base_tag_removed(self):
        result = sanitize_html("<base href='http://evil.com'>")
        assert "base" not in result


class TestSafeContentPreserved:
    def test_basic_html_preserved(self):
        html = "<h1>Title</h1><p>Paragraph with <strong>bold</strong></p>"
        result = sanitize_html(html)
        assert "<h1>Title</h1>" in result
        assert "<strong>bold</strong>" in result or "<strong>bold</strong>" in result

    def test_table_preserved(self):
        html = (
            "<table><tr><td>Cell 1</td><td>Cell 2</td></tr></table>"
        )
        result = sanitize_html(html)
        assert "<table>" in result
        assert "<td>" in result

    def test_allowed_styles_preserved(self):
        html = '<p style="text-align:center">Centered</p>'
        result = sanitize_html(html)
        assert "text-align" in result or "center" in result

    def test_disallowed_style_removed(self):
        html = '<p style="position:absolute;top:0;left:0">Hack</p>'
        result = sanitize_html(html)
        assert "position" not in result
        assert "Hack" in result


class TestPlainTextExtraction:
    def test_basic_extraction(self):
        html = "<p>Hello World</p>"
        text = extract_plain_text(html)
        assert text == "Hello World"

    def test_script_removed_from_text(self):
        html = "<p>Safe</p><script>alert('xss')</script>"
        text = extract_plain_text(html)
        assert "alert" not in text
        assert "Safe" in text

    def test_multiline_text(self):
        html = "<p>Line 1</p><p>Line 2</p>"
        text = extract_plain_text(html)
        assert "Line 1" in text
        assert "Line 2" in text

    def test_table_to_text(self):
        html = "<table><tr><td>A</td><td>B</td></tr></table>"
        text = extract_plain_text(html)
        assert "A" in text
        assert "B" in text

    def test_empty_html(self):
        assert extract_plain_text("") == ""
        assert extract_plain_text(None) == ""
