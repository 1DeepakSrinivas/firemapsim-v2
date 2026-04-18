# Problem Statement: FireMapSim-v2

## Project Objectives
The primary objective of FireMapSim-v2 is to provide a modern, AI-assisted platform for wildfire simulation and geospatial analysis. It aims to bridge the gap between complex numerical simulation models (like DEVS-FIRE) and on-the-ground operational needs by providing an intuitive graphical interface and an intelligent agent to assist in simulation setup.

## Motivation
Wildfire simulation setup is traditionally a high-friction process requiring:
- Precise geospatial coordinates for project boundaries and ignitions.
- Real-time weather data (wind speed, direction, temperature, humidity).
- Detailed fuel and terrain information.
- Manual configuration of simulation parameters (timesteps, cell resolution).

Operators in high-stress environments need a tool that can:
1. **Automate data gathering**: Fetch weather and geographic data based on simple user inputs (ZIP codes, addresses).
2. **Simplify configuration**: Use an AI agent to guide the user through the intake process, ensuring all required parameters are set.
3. **Visualize results**: Provide immediate, interactive feedback on a map to understand fire spread patterns.

## Scope of the Project
FireMapSim-v2 encompasses the following scope:
- **Interactive Map Interface**: A Leaflet-based workspace for drawing project areas, ignitions, and fuel breaks.
- **Agentic AI Orchestration**: A Mastra-powered agent that maintains simulation state, suggests default values, and triggers backend execution.
- **Service Integration**: Connectivity with weather APIs for real-time conditions and a proxy to the DEVS-FIRE simulation engine.
- **Data Life-cycle**: Support for creating, resetting, and replaying simulations with local and cloud persistence.
