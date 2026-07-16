# Use official Node LTS image
FROM node:24-alpine

# Set working directory
WORKDIR /QLeverToWebAssembly

# Copy package files first (better layer caching)
COPY package.json /QLeverToWebAssembly/
COPY package-lock.json /QLeverToWebAssembly/

# Install dependencies
RUN npm install

# Copy the rest of the project
COPY src /QLeverToWebAssembly/src/
COPY public /QLeverToWebAssembly/public/
COPY index.html /QLeverToWebAssembly/
COPY tsconfig.json /QLeverToWebAssembly/
COPY vite.config.ts /QLeverToWebAssembly/

# Expose Vite default port
EXPOSE 5173

# Allow Vite to be accessible outside container
CMD ["npm", "run", "dev", "--", "--host"]

# Run 'npm run dev' and open the visible URL (should be: http://localhost:5173/)
# Ignore the pop up box. You can now interact with the site. 
