# Contributing to Clutch Hub Demo App

Thank you for your interest in contributing to Clutch Hub Demo App! We welcome contributions from the community and appreciate your help in making this project better.

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct. Please report unacceptable behavior to mehran.mazhar@gmail.com.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the issue tracker to avoid duplicates. When creating a bug report, please include:

- A clear and descriptive title
- A detailed description of the issue
- Steps to reproduce the problem
- Screenshots or video recordings if applicable
- Expected behavior vs. actual behavior
- Your environment details (browser, OS, screen resolution, etc.)
- Console error messages

### Suggesting Enhancements

Enhancement suggestions are welcome! Please provide:

- A clear and descriptive title
- A detailed description of the proposed UI/UX enhancement
- Explain why this enhancement would be useful
- Include mockups or wireframes if possible
- Consider accessibility and mobile responsiveness

### Code Contributions

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test in multiple browsers
5. Ensure the build passes (`npm run build`)
6. Test responsiveness on different screen sizes
7. Run linting (`npm run lint`)
8. Commit your changes (`git commit -m 'Add some amazing feature'`)
9. Push to the branch (`git push origin feature/amazing-feature`)
10. Open a Pull Request

### Development Setup

1. Install Node.js (16+)
2. Clone your fork
3. Run `npm install` to install dependencies
4. Run `npm run dev` to start the development server
5. Open `http://localhost:5173` in your browser
6. Make sure you have the clutch-hub-sdk-js linked if testing locally

## Style Guidelines

### React/JavaScript Code Style

- Follow the existing code style
- Use functional components with hooks
- Use descriptive component and variable names
- Keep components focused and reusable
- Use proper prop validation
- Follow React best practices

### UI/UX Guidelines

- Follow modern design principles
- Ensure accessibility (ARIA labels, keyboard navigation)
- Make responsive design for mobile and desktop
- Use consistent spacing and typography
- Provide clear user feedback for actions
- Handle loading and error states gracefully

### CSS Guidelines

- Use CSS modules or styled-components
- Follow BEM methodology if using plain CSS
- Use consistent color palette
- Implement responsive design with mobile-first approach
- Optimize for performance (minimize CSS bundle size)

### Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

## Testing

- Test functionality in multiple browsers
- Test on different screen sizes and devices
- Test keyboard navigation and accessibility
- Verify all user interactions work correctly
- Test error scenarios and edge cases
- Ensure forms validate correctly

## UI/UX Considerations

- **Accessibility**: Ensure the app is usable by people with disabilities
- **Performance**: Optimize for fast loading and smooth interactions
- **Mobile-first**: Design for mobile devices first, then scale up
- **User feedback**: Provide clear feedback for all user actions
- **Error handling**: Display helpful error messages
- **Loading states**: Show appropriate loading indicators

## Security Considerations

- Never display private keys in the UI
- Warn users about security implications
- Use HTTPS for all external requests
- Sanitize user inputs
- Follow best practices for client-side security
- Educate users about blockchain security

## Browser Compatibility

- Test in major browsers (Chrome, Firefox, Safari, Edge)
- Consider mobile browser compatibility
- Use appropriate polyfills if needed
- Document browser requirements
- Test on different devices and screen sizes

## Performance Guidelines

- Optimize images and assets
- Minimize bundle size
- Use lazy loading for non-critical components
- Optimize re-renders with React.memo and useMemo
- Monitor and profile performance

## Documentation

- Update README.md with new features
- Include screenshots of new UI elements
- Document any new configuration options
- Keep setup instructions up to date
- Include user guide for new features

## Review Process

1. All submissions require review
2. Reviewers will check for:
   - Code quality and style
   - UI/UX consistency
   - Accessibility compliance
   - Browser compatibility
   - Performance implications
   - Security considerations
   - Mobile responsiveness

## Recognition

Contributors will be recognized in our README and releases. Thank you for helping make Clutch Hub Demo App better!

## Questions?

Feel free to contact us at mehran.mazhar@gmail.com or open an issue for discussion.




