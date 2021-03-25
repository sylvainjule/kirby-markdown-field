import { syntaxTree } from "@codemirror/language";
import { Direction } from "@codemirror/view";
import { CharCategory } from "@codemirror/state";
import { ltrim, rtrim } from "./strings.js";
import {
  BlockTypes,
  BlockMarks,
  InlineTypes,
  getCurrentInlineToken
} from "./syntax.js";

function isBoundaryChar(state, from, to) {
  const categorize = state.charCategorizer(from);
  return categorize(state.sliceDoc(from, to)) != CharCategory.Word;
}

function getPrevCharRange(view) {
  return view.state.selection.main.head > 0
    ? view.moveByChar(
        view.state.selection.main,
        view.textDirection != Direction.LTR
      )
    : null;
}

function getNextCharRange(view) {
  return view.state.selection.main.head < view.state.doc.length
    ? view.moveByChar(
        view.state.selection.main,
        view.textDirection == Direction.LTR
      )
    : null;
}

function getPrevGroupRange(view) {
  return view.state.selection.main.head > 0
    ? view.moveByGroup(
        view.state.selection.main,
        view.textDirection != Direction.LTR
      )
    : null;
}

function getNextGroupRange(view) {
  return view.state.selection.main.head < view.state.doc.length
    ? view.moveByGroup(
        view.state.selection.main,
        view.textDirection == Direction.LTR
      )
    : null;
}

export function toggleLines(view, type, selection = null) {
  const state = view.state;
  const tree = syntaxTree(state);
  const { from, to } = selection || view.state.selection.main;
  const firstLine = state.doc.lineAt(from);
  const lastLine = state.doc.lineAt(to);

  const lines = [];
  let output = [];
  let selectionOffset = 0;

  for (let l = firstLine.number, lMax = lastLine.number; l <= lMax; l++) {
    // gather information for about all selected lines
    const line = state.doc.line(l);
    let block = null;
    let mark = null;
    let listNumber = null;

    tree.iterate({
      enter: (node, from, to) => {
        if (BlockTypes[node.name]) {
          block = node.name;
        } else if (BlockMarks.includes(node.name)) {
          mark = { ...node, from, to };
          if (block === "OrderedList") {
            listNumber = parseInt(
              line.text.slice(from - line.from, to - line.from, 10)
            );
          }
        }

        if (block && mark) {
          // Stop iterating, it block and mark where both found
          return false;
        }
      },
      from: line.from,
      to: line.to
    });

    lines.push({
      line,
      block,
      mark,
      listNumber
    });
  }

  // Checks if all selected lines already have target block type;
  const isTargetBlockType = lines.reduce(
    (result, { block }) => !(!result || block !== type),
    true
  );

  if (isTargetBlockType) {
    // all lines are target block type, remove marks

    output = lines.map(({ line, block, mark }) => {
      if (block === "HorizontalRule") {
        // Remove whole line content for rules
        return "";
      } else if (mark) {
        const text = ltrim(line.text.substring(mark.to - line.from));
        selectionOffset -= line.text.length - text.length;
        return text;
      }

      // no mark to remove, do nothing. Should never occur, but let’s
      // be safe to avoid errors.
      return line.text;
    });
  } else if (type === "HorizontalRule") {
    // Replace whole selection with rule cursor should end up at the end of the
    // new inserted characters.

    let textBefore = rtrim(state.doc.slice(0, from).toString());
    let textAfter = ltrim(state.doc.slice(to).toString());

    textBefore = textBefore + (textBefore.length > 0 ? "\n\n" : "") + "***";
    textAfter = "\n\n" + textAfter;

    view.dispatch({
      changes: {
        from: 0,
        to: state.doc.length,
        insert: textBefore + textAfter
      },
      selection: { anchor: textBefore.length },
      scrollIntoView: true
    });

    return;
  } else {
    // different lines types => add/replace lines marks

    let listNumber = 1;

    output = lines.map(({ line, mark }) => {
      const prefix =
        type === "OrderedList" ? listNumber++ + ". " : BlockTypes[type] + " ";
      let text;

      if (mark) {
        // replace old mark
        text = prefix + ltrim(line.text.substring(mark.to - line.from));
      } else {
        text = prefix + line.text;
      }

      selectionOffset += text.length - line.text.length;
      return text;
    });
  }

  view.dispatch({
    changes: {
      from: firstLine.from,
      to: lastLine.to,
      insert: output.join(state.lineBreak)
    },
    selection: {
      anchor: state.selection.main.anchor + selectionOffset,
      head: state.selection.main.head + selectionOffset
    },
    scrollIntoView: true
  });
}

export function toggleMark(view, type, selection = null) {
  const { format, node } = getCurrentInlineToken(view);
  const state = view.state;
  const sel = selection || state.selection.main;
  const mark = InlineTypes[type];



  if (
    format !== null && view.state.sliceDoc(node.from, node.from + mark.length) === mark
  ) {
    // Remove format/add another one

    if (sel.from !== sel.to) {
      // selection
      console.log("how to deal with selection?");
    } else {
      // no selection
      // TODO: Only toggle selected word


      view.dispatch({
        changes: {
          from: node.from,
          to: node.to,
          insert: state.sliceDoc(node.from + mark.length, node.to - mark.length)
        },
        selection: { anchor: sel.from - mark.length }
      });
    }

  } else if (state.sliceDoc(sel.from - mark.length, sel.to + mark.length) === mark + mark) {
    // Remove empty formatting marks. e.g. `**|**`

    view.dispatch({
      changes: {
        from: sel.from - mark.length,
        to: sel.to + mark.length,
        insert: ""
      },
      selection: { anchor: sel.from - mark.length }
    });

  } else if (sel.from !== sel.to) {
    // wrap current selection
    // TODO: Wrap multiple lines separately, because Markdown does not support multi-line inline formats

    view.dispatch(
      state.replaceSelection(mark + state.sliceDoc(sel.from, sel.to) + mark)
    );

    view.dispatch({
      selection: {
        anchor: sel.anchor + mark.length,
        head: sel.head + mark.length
      }
    });

  } else {
    // No selection, add formatting to adjacent word

    const prevChar = getPrevCharRange(view);
    const prevGroupRange = prevChar !== null ? getPrevGroupRange(view) : null;
    const isBoundaryBefore = !prevChar || isBoundaryChar(view.state, prevChar.from, sel.head);
    const nextChar = getNextCharRange(view);
    const nextGroupRange = nextChar !== null ? getNextGroupRange(view) : null;
    const isBoundaryAfter = !nextChar || isBoundaryChar(view.state, sel.head, nextChar.from);

    if (isBoundaryBefore && isBoundaryAfter) {
      // Cursor sorrounded by boundaries, e.g. `word | word`
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: mark + mark },
        selection: { anchor: sel.from + mark.length }
      });
    } else if (isBoundaryBefore && !isBoundaryAfter) {
      // before word, e.g. ` |word`
      view.dispatch({
        changes: {
          from: sel.from,
          to: nextGroupRange.to,
          insert: mark + state.sliceDoc(sel.from, nextGroupRange.to) + mark
        },
        selection: { anchor: sel.from + mark.length }
      });
    } else if (isBoundaryAfter && !isBoundaryBefore) {
      // after word, e.g. `word| `, `word|.`

      view.dispatch({
        changes: {
          from: prevGroupRange.from,
          to: sel.to,
          insert: mark + state.sliceDoc(prevGroupRange.from, sel.to) + mark
        },
        selection: { anchor: sel.to + mark.length }
      });

    } else if (!isBoundaryBefore && !isBoundaryAfter) {
      // within word, e.g. `wo|rd`

      view.dispatch({
        changes: {
          from: prevGroupRange.from,
          to: nextGroupRange.to,
          insert:
            mark + state.sliceDoc(prevGroupRange.from, nextGroupRange.to) + mark
        },
        selection: { anchor: sel.from + mark.length }
      });

    }
  }
}