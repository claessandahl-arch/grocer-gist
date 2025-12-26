---
description: Use Context7 for documentation before implementing new features
---

# Context7 Documentation Workflow

Before starting any new implementation, follow these steps:

## 1. Identify Libraries
Determine which libraries/frameworks are involved in the implementation (e.g., React, Firebase, Next.js, etc.)

## 2. Resolve Library IDs
Use the `mcp_context7_resolve-library-id` tool to find the correct Context7 library ID for each relevant library.

## 3. Fetch Documentation
Use the `mcp_context7_get-library-docs` tool to retrieve up-to-date documentation:
- Use `mode='code'` for API references and code examples
- Use `mode='info'` for conceptual guides and architectural questions
- Specify a relevant `topic` to focus the documentation search

## 4. Apply Documentation
Reference the fetched documentation when writing implementation code to ensure:
- Using current API patterns
- Following best practices
- Avoiding deprecated features

## Example Usage
```
// For a React component with Firebase:
1. resolve-library-id("react")
2. resolve-library-id("firebase")
3. get-library-docs(libraryID="/facebook/react", topic="hooks")
4. get-library-docs(libraryID="/firebase/firebase-js-sdk", topic="firestore")
```
