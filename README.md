# JP-Domain

JP-Domain is a lightweight personal site and utility hub built around practical tools for fantasy football and tabletop play.

## What this site is for

This project serves as a small collection of browser-based utilities for real-world planning and game management:

- `/` is the landing page and home for the site.
- `/lineup-coach/` helps a fantasy football manager turn a roster into a clear start/sit decision by comparing players against tier data and team context.
- `/dm-screen/` is a D&D 5e encounter tracker for keeping initiative, HP, conditions, and combat notes organized during play.

## Core tools

### Lineup Coach
The Lineup Coach is designed to help someone quickly evaluate a fantasy lineup. It pulls in league and roster information, compares players against tier recommendations, and surfaces a clean recommendation view for weekly decisions.

### DM Screen
The DM Screen is a utility for running tabletop combat sessions. It helps keep track of:

- player and NPC initiative order
- HP and max HP
- passive perception and insight
- conditions and status effects
- damage application and quick adjustments
- campaign-based record keeping in the browser

## Design intent

The site is intentionally compact and functional: useful tools first, with a consistent visual system, dark/light mode support, and a simple utility row for navigation and login state.

## Notes

The project is built to run as a Cloudflare Worker with static assets, and it includes secure Access-based user data storage where configured. The goal is not to be a large app framework; it is a focused set of tools that are easy to use while gaming or planning.