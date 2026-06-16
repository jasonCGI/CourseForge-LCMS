from datetime import datetime


def build_shell_json(gui: dict) -> dict:
    """
    Build the gui_shell.json configuration file.
    This is the canonical record of the shell's layout.
    """
    return {
        'schema_version': '1.0',
        'tool':           'ForgeGUI',
        'tool_version':   '1.0.0',
        'created_at':     datetime.utcnow().isoformat() + 'Z',
        'name':           gui.get('name', 'Untitled Shell'),
        'stage':          gui.get('stage', {}),
        'content_area':   gui.get('content_area', {}),
        'buttons':        gui.get('buttons', []),
        'zones':          gui.get('zones', []),
    }
