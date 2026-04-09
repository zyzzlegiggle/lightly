import requests
import re
from typing import List, Dict, Optional

class NotionService:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28"
        }

    def search(self, query: str) -> List[Dict]:
        """Search for pages in Notion."""
        resp = requests.post(
            "https://api.notion.com/v1/search",
            headers=self.headers,
            json={"query": query, "page_size": 5}
        )
        if not resp.ok:
            return []
        results = resp.json().get("results", [])
        return [
            {
                "id": r["id"],
                "type": r["object"],
                "title": r.get("properties", {}).get("title", {}).get("title", [{}])[0].get("plain_text", "Untitled") 
                         if r["object"] == "page" else r.get("title", [{}])[0].get("plain_text", "Untitled"),
                "url": r["url"]
            }
            for r in results
        ]

    def _parse_rich_text(self, text: str) -> List[Dict]:
        """Convert basic markdown (bold, italic, code) to Notion rich text."""
        # Regex for bold-italic (***), bold (**) or (__), italic (*) or (_), code (`), links [text](url)
        pattern = r"(\*\*\*.*?\*\*\*|\*\*.*?\*\*|__.*?__|\*.*?\*|_.*?_|`.*?`|\[.*?\]\(.*?\))"
        parts = re.split(pattern, text)
        
        rich_text = []
        for part in parts:
            if not part:
                continue
            
            # Bold + Italic (***)
            if part.startswith("***") and part.endswith("***") and len(part) > 6:
                rich_text.append({"type": "text", "text": {"content": part[3:-3]}, "annotations": {"bold": True, "italic": True}})
            # Bold (** or __)
            elif ((part.startswith("**") and part.endswith("**")) or (part.startswith("__") and part.endswith("__"))) and len(part) > 4:
                rich_text.append({"type": "text", "text": {"content": part[2:-2]}, "annotations": {"bold": True}})
            # Italic (* or _)
            elif ((part.startswith("*") and part.endswith("*")) or (part.startswith("_") and part.endswith("_"))) and len(part) > 2:
                rich_text.append({"type": "text", "text": {"content": part[1:-1]}, "annotations": {"italic": True}})
            # Code (`)
            elif part.startswith("`") and part.endswith("`") and len(part) > 2:
                rich_text.append({"type": "text", "text": {"content": part[1:-1]}, "annotations": {"code": True}})
            # Link [text](url)
            elif part.startswith("[") and "](" in part and part.endswith(")"):
                m = re.match(r"\[(.*?)\]\((.*?)\)", part)
                if m:
                    rich_text.append({"type": "text", "text": {"content": m.group(1), "link": {"url": m.group(2)}}})
                else:
                    rich_text.append({"type": "text", "text": {"content": part}})
            else:
                rich_text.append({"type": "text", "text": {"content": part}})
        
        return rich_text if rich_text else [{"type": "text", "text": {"content": ""}}]

    def create_page(self, parent_id: str, title: str, content: str = "") -> Dict:
        """Create a new page in Notion with basic markdown parsing."""
        blocks = []
        lines = content.split("\n")
        
        in_code_block = False
        code_content = []
        code_lang = "plain text"

        for line in lines:
            stripped = line.strip()
            
            # Code blocks
            if stripped.startswith("```"):
                if in_code_block:
                    # Close code block
                    blocks.append({
                        "object": "block",
                        "type": "code",
                        "code": {
                            "rich_text": [{"type": "text", "text": {"content": "\n".join(code_content)}}],
                            "language": code_lang
                        }
                    })
                    code_content = []
                    in_code_block = False
                else:
                    # Open code block
                    in_code_block = True
                    code_lang = stripped[3:].strip() or "plain text"
                continue

            if in_code_block:
                code_content.append(line)
                continue

            if not stripped:
                continue

            # Block-level parsing
            if stripped.startswith("## "):
                blocks.append({
                    "object": "block",
                    "type": "heading_2",
                    "heading_2": {"rich_text": self._parse_rich_text(stripped[3:])}
                })
            elif stripped.startswith("### "):
                blocks.append({
                    "object": "block",
                    "type": "heading_3",
                    "heading_3": {"rich_text": self._parse_rich_text(stripped[4:])}
                })
            elif stripped.startswith("- ") or stripped.startswith("* "):
                blocks.append({
                    "object": "block",
                    "type": "bulleted_list_item",
                    "bulleted_list_item": {"rich_text": self._parse_rich_text(stripped[2:])}
                })
            elif re.match(r"^\d+\.\s", stripped):
                m = re.match(r"^(\d+\.\s)(.*)", stripped)
                blocks.append({
                    "object": "block",
                    "type": "numbered_list_item",
                    "numbered_list_item": {"rich_text": self._parse_rich_text(m.group(2))}
                })
            else:
                # Paragraph
                blocks.append({
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {"rich_text": self._parse_rich_text(line)}
                })

        if not blocks:
            blocks = [{
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": ""}}]
                }
            }]

        payload = {
            "parent": {"page_id": parent_id},
            "properties": {
                "title": {"title": [{"text": {"content": title}}]}
            },
            "children": blocks[:100]
        }
        resp = requests.post(
            "https://api.notion.com/v1/pages",
            headers=self.headers,
            json=payload
        )
        if not resp.ok:
            print(f"[Notion] Error: {resp.text}")
        resp.raise_for_status()
        return resp.json()

