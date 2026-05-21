# Contributing

You'll find here guidelines on how the repository is set up and how to possibly contribute to it.

## https://discord.gg/graphprotocol

## Table of Contents

- [Asking Questions](#asking-questions)
- [Contributing](#contributing)
    - [Reporting Bugs](#reporting-bugs)
    - [Suggesting Enhancements](#suggesting-enhancements)
    - [Submitting PRs](#submitting-prs)
- [Style guides](#style-guides)
    - [Code](#code)
    - [Commit Messages](#commit-messages)

## Asking Questions

> [!NOTE]
> Make sure you have read the [documentation](README.md) first !

Before you ask a question, it is best to search for existing [Issues](/issues) that might help you. In case you have found a suitable issue and still need clarification, you can write your question in this issue. It is also advisable to search the internet for answers first.

<!-- TODO: Issue VS Tech support in Discord ? -->

If you then still feel the need to ask a question and need clarification, we recommend the following:

- Open an [Issue](/issues/new).
- Provide as much context as you can about what you're running into.
- Provide project and platform versions depending on what seems relevant.

## Contributing

<!-- TODO: Keep that ?
> ### Legal Notice
> When contributing to this project, you must agree that you have authored 100% of the content, that you have the necessary rights to the content and that the content you contribute may be provided under the project license.
-->

### Reporting Bugs

#### Before Submitting a Bug Report

A good bug report shouldn't leave others needing to chase you up for more information. Therefore, we ask you to investigate carefully, collect information and describe the issue in detail in your report. Please complete the following steps in advance to help fix any potential bug as fast as possible.

- Make sure that you are using the [latest version](/releases). If you're using the binary, you can check with `pinax-api --version`.
- Determine if your bug is really a bug and not an error on your side e.g. using incompatible environment components/versions (make sure that you have read the [documentation](README.md). If you are looking for support, you might want to check [this section](#asking-questions)).
- To see if other users have experienced (and potentially already solved) the same issue you are having, check if there is not already a bug report existing for your bug or error in the [bug tracker](/issues?q=label%3Abug).
- Also make sure to search the internet (including Stack Overflow) to see if users outside the GitHub community have discussed the issue.
- Collect information about the bug:
    - Stack trace if possible
    - OS, Platform and Version (Windows, Linux, macOS, x86, ARM)
    - Version of the [Bun](https://bun.sh/) binary, `bun --version`
    - Possibly your environment variables and the output
    - Can you reliably reproduce the issue? And can you also reproduce it with older versions?

#### How Do I Submit a Good Bug Report?

<!-- TODO: Figure out security policy
  > You must never report security related issues, vulnerabilities or bugs including sensitive information to the issue tracker, or elsewhere in public. Instead, sensitive bugs must be sent by email to <>.
-->

We use GitHub issues to track bugs and errors. If you run into an issue with the project:

- Open an [Issue](/issues/new?assignees=0237h&labels=bug&projects=&template=bug_report.md&title=).
- Explain the behavior you would expect and the actual behavior.
- Please provide as much context as possible and describe the _reproduction steps_ that someone else can follow to recreate the issue on their own. This usually includes your code. For good bug reports you should isolate the problem and create a reduced test case.
- Provide the information you collected in the previous section.

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion, **including completely new features and minor improvements to existing functionality**. Following these guidelines will help maintainers and the community to understand your suggestion and find related suggestions.

#### Before Submitting an Enhancement

- Make sure that you are using the [latest version](/releases). If you're using the binary, you can check with `pinax-api --version`.
- Read the [documentation](README.md) carefully and find out if the functionality is already covered, maybe by an individual configuration.
- Perform a [search](/issues) to see if the enhancement has already been suggested. If it has, add a comment to the existing issue instead of opening a new one.
- Find out whether your idea fits with the scope and aims of the project. Keep in mind that features should be useful to the majority of users and not just a small subset.

#### How Do I Submit a Good Enhancement Suggestion?

Enhancement suggestions are tracked as [GitHub issues](/issues).

- Open an [Issue](/issues/new?assignees=0237h&labels=feature&projects=&template=feature_request.md&title=).
- Use a **clear and descriptive title** for the issue to identify the suggestion.
- Provide a **step-by-step description of the suggested enhancement** in as many details as possible.
- **Describe the current behavior** and **explain which behavior you expected to see instead** and why. At this point you can also tell which alternatives do not work for you.
- **Explain why this enhancement would be useful** to most users. You may also want to point out the other projects that solved it better and which could serve as inspiration.

### Submitting PRs

You can follow the instructions from the `Quick Start` section of the [`README.md`](README.md/#quick-start) for setting up the environment.

The repository contains one `main` branch. Any changes to `main` must go through a pull request of a branch with a specific naming pattern (see below).

Any push to `main` branch will be tagged with the commit hash and the latest commit will additionally be tagged with `develop` to enable pulling latest development image (this is done automatically). You can retrieve the latest stable version of the API by checking out the latest tagged version commit (following [_semver_](https://semver.org/)).

PRs should be submitted from separate branches of the `main` branch. Ideally, your PR should fall into one the following categories:

- **Feature**: `feature/xxx`
- **Bug fix**: `fix/xxx`, try to make separate PRs for different bug fixes unless the change solves multiple bugs at once.
- **Documentation**: `docs/xxx`, adding comments to files should be counted as documentation and changes made into a separate branch.
- **Operations**: `ops/xxx`
- **Others**: any other branching scheme or no branch will be counted as a miscellaneous change, avoid if possible.

The reasoning behind these categories is to make it easier to track changes as well as drafting future releases (see [`release-drafter.yml`](.github/release-drafter.yml) action for more details).

> [!WARNING]
> Make sure to tag any issues associated with the PR if one (or more) exists in your commit message.

## Style guides

### Code

If you're using a standard IDE like [VSCode](https://code.visualstudio.com/), [Sublime Text](https://www.sublimetext.com/), etc. there shouldn't be any formatting issues. The code is formatted accorded to what the [LSP Typescript](https://github.com/typescript-language-server/typescript-language-server) standard client is using. Details about the settings used can be found [here](https://github.com/sublimelsp/LSP-typescript/blob/00aef378fd99283ae8451fe8f3f2483fa62b7d8e/LSP-typescript.sublime-settings#L61).

### Commit Messages

Here's a helpful commit message template adapted from [cbeams' article](https://cbea.ms/git-commit/): _How to Write a Git Commit Message_.

```
# Summarize changes in about 50 characters or less
# 50 characters limit ############################
#
# More detailed explanatory text, if necessary. Wrap it to about 72
# characters or so. In some contexts, the first line is treated as the
# subject of the commit and the rest of the text as the body. The
# blank line separating the summary from the body is critical (unless
# you omit the body entirely); various tools like `log`, `shortlog`
# and `rebase` can get confused if you run the two together.
# 72 characters limit ##################################################
#
# Explain the problem that this commit is solving. Focus on why you
# are making this change as opposed to how (the code explains that).
# Are there side effects or other unintuitive consequences of this
# change? Here's the place to explain them.
#
# Further paragraphs come after blank lines.
#
#  - Bullet points are okay, too
#  - Typically a hyphen or asterisk is used for the bullet, preceded
#    by a single space, with blank lines in between, but conventions
#    vary here
#
# Put references to relevant issues at the bottom, like this:
#
# Resolves: #123
# See also: #456, #789
```

To use it, simply save it as a `.gitmessage` file and use the following comment to make `git` use it:

```console
git config commit.template ~/.gitmessage # Make sure to have the right path to your message file
```

or to configure it globally

```console
git config --global commit.template ~/.gitmessage # Make sure to have the right path to your message file
```

<!-- TODO: Add example commit -->

## Attribution

This guide is based on the **contributing-gen**. [Make your own](https://github.com/bttger/contributing-gen)!
