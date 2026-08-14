"""
Manage SOC panel users from the command line.

Usage (run from the llm-guard/ folder, with your venv active):

    python manage_soc_users.py list
    python manage_soc_users.py add <username> <password>
    python manage_soc_users.py reset-password <username> <new_password>
    python manage_soc_users.py delete <username>

The very first time you run anything, a default account is
auto-created: username "admin", password "changeme-now!".
Change it immediately with:

    python manage_soc_users.py reset-password admin <your-new-password>
"""

import sys

import soc_auth


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    command = sys.argv[1]

    if command == "list":
        users = soc_auth.list_users()
        if not users:
            print("No SOC users yet.")
        for u in users:
            print(f"- {u}")

    elif command == "add":
        if len(sys.argv) != 4:
            print("Usage: python manage_soc_users.py add <username> <password>")
            return
        username, password = sys.argv[2], sys.argv[3]
        soc_auth.create_or_update_user(username, password)
        print(f"Created/updated SOC user '{username}'.")

    elif command == "reset-password":
        if len(sys.argv) != 4:
            print("Usage: python manage_soc_users.py reset-password <username> <new_password>")
            return
        username, password = sys.argv[2], sys.argv[3]
        soc_auth.create_or_update_user(username, password)
        print(f"Password reset for SOC user '{username}'.")

    elif command == "delete":
        if len(sys.argv) != 3:
            print("Usage: python manage_soc_users.py delete <username>")
            return
        username = sys.argv[2]
        if soc_auth.delete_user(username):
            print(f"Deleted SOC user '{username}'.")
        else:
            print(f"No such user '{username}'.")

    else:
        print(__doc__)


if __name__ == "__main__":
    main()
