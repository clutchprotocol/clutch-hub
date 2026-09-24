# Contributing to Clutch Hub API

Thank you for your interest in contributing to Clutch Hub API! We welcome contributions from the community and appreciate your help in making this project better.

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct. Please report unacceptable behavior to mehran.mazhar@gmail.com.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the issue tracker to avoid duplicates. When creating a bug report, please include:

- A clear and descriptive title
- A detailed description of the issue
- Steps to reproduce the problem
- API endpoints affected
- Request/response examples
- Your environment details (OS, Rust version, etc.)
- Any relevant logs or error messages

### Suggesting Enhancements

Enhancement suggestions are welcome! Please provide:

- A clear and descriptive title
- A detailed description of the proposed API enhancement
- Explain why this enhancement would be useful
- Include API design examples if possible
- Consider backward compatibility

### Code Contributions

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for your changes
5. Ensure tests pass (`cargo test`)
6. Run clippy for linting (`cargo clippy`)
7. Format your code (`cargo fmt`)
8. Test API endpoints manually
9. Commit your changes (`git commit -m 'Add some amazing feature'`)
10. Push to the branch (`git push origin feature/amazing-feature`)
11. Open a Pull Request

### Development Setup

1. Install Rust (1.70+)
2. Clone your fork
3. Copy configuration files: `cp config/default.toml config/local.toml`
4. Update local configuration as needed
5. Run `cargo build` to compile
6. Run `cargo test` to run tests
7. Run `cargo run` to start the development server

## Style Guidelines

### Rust Code Style

- Follow the standard Rust formatting (`cargo fmt`)
- Use descriptive variable and function names
- Add documentation comments for public APIs
- Follow Rust naming conventions
- Keep functions focused and small
- Use proper error handling with custom error types

### API Design

- Follow RESTful conventions
- Use consistent naming for endpoints
- Provide clear error messages
- Include proper HTTP status codes
- Validate input data thoroughly
- Document all endpoints

### Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

## Testing

- Write unit tests for business logic
- Write integration tests for API endpoints
- Test error handling scenarios
- Ensure existing tests continue to pass
- Test with various input combinations
- Include performance tests for critical paths

## API Documentation

- Update README.md with new endpoints
- Include request/response examples
- Document authentication requirements
- Specify rate limits if applicable
- Include error response formats

## Security Considerations

- Never log sensitive data
- Validate all inputs
- Use proper authentication/authorization
- Follow OWASP guidelines
- Consider rate limiting
- Implement proper CORS policies

## Review Process

1. All submissions require review
2. Reviewers will check for:
   - Code quality and style
   - API design consistency
   - Test coverage
   - Documentation completeness
   - Security considerations
   - Performance implications

## Recognition

Contributors will be recognized in our README and releases. Thank you for helping make Clutch Hub API better!

## Questions?

Feel free to contact us at mehran.mazhar@gmail.com or open an issue for discussion.




