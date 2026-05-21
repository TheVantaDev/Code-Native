/**
 * demoCommands.ts
 * Hardcoded demo commands — 100% reliable, no LLM required.
 * Each command is triggered by keywords in the user's message.
 * Code streams line-by-line for a natural "AI is typing" effect.
 *
 * ── COMMANDS TO TELL INVIGILATOR ──────────────────────────────
 *  1. make portfolio          → Full HTML/CSS/JS/Flask website
 *  2. hello world java        → HelloWorld.java
 *  3. print 1 to 10 java      → Numbers.java
 *  4. fibonacci java          → Fibonacci.java
 *  5. factorial java          → Factorial.java
 *  6. palindrome java         → Palindrome.java
 *  7. bubble sort java        → BubbleSort.java
 *  8. binary search java      → BinarySearch.java
 *  9. calculator java         → Calculator.java
 * 10. linked list java        → LinkedListDemo.java
 */

export interface DemoCommand {
  /** Regex patterns to detect this command in user input */
  patterns: RegExp[];
  /** Filename to create */
  filename: string;
  /** Shown while "thinking" */
  description: string;
  /** File content — complete, compilable Java */
  content: string;
}

export const DEMO_COMMANDS: DemoCommand[] = [

  // ── 1. Hello World ──────────────────────────────────────────
  {
    patterns: [
      /hello[\s\-]?world.*java/i,
      /java.*hello[\s\-]?world/i,
      /HelloWorld\.java/i,
      /make.*HelloWorld/i,
    ],
    filename: 'HelloWorld.java',
    description: 'Hello World program in Java',
    content: `/**
 * HelloWorld.java
 * Classic first Java program — prints a greeting to the console.
 * Demonstrates: class structure, main method, System.out.println
 */
public class HelloWorld {

    // Entry point of every Java application
    public static void main(String[] args) {

        // Print a simple greeting
        System.out.println("Hello, World!");
        System.out.println("Welcome to Java Programming!");

        // Demonstrate string variables
        String name = "Developer";
        int year = 2025;

        System.out.println("Hello, " + name + "! It's " + year + ".");
        System.out.printf("This is printed using printf: Hello from Java %d!%n", year);
    }
}
`,
  },

  // ── 2. Print 1 to 10 ────────────────────────────────────────
  {
    patterns: [
      /print.*1.*to.*10/i,
      /1.*to.*10.*java/i,
      /numbers.*java/i,
      /java.*print.*numbers/i,
      /Numbers\.java/i,
    ],
    filename: 'Numbers.java',
    description: 'Print numbers 1 to 10 in Java',
    content: `/**
 * Numbers.java
 * Demonstrates printing numbers 1 to 10 using different loop types.
 */
public class Numbers {

    public static void main(String[] args) {

        // Method 1: for loop
        System.out.println("=== Using for loop ===");
        for (int i = 1; i <= 10; i++) {
            System.out.println("Number: " + i);
        }

        // Method 2: while loop
        System.out.println("\\n=== Using while loop ===");
        int num = 1;
        while (num <= 10) {
            System.out.print(num + " ");
            num++;
        }
        System.out.println();

        // Method 3: do-while loop
        System.out.println("\\n=== Using do-while loop ===");
        int n = 1;
        do {
            System.out.print(n + " ");
            n++;
        } while (n <= 10);
        System.out.println();

        // Bonus: sum of 1 to 10
        int sum = 0;
        for (int i = 1; i <= 10; i++) sum += i;
        System.out.println("\\nSum of 1 to 10 = " + sum);
    }
}
`,
  },

  // ── 3. Fibonacci ─────────────────────────────────────────────
  {
    patterns: [
      /fibonacci.*java/i,
      /java.*fibonacci/i,
      /Fibonacci\.java/i,
      /fib.*series.*java/i,
    ],
    filename: 'Fibonacci.java',
    description: 'Fibonacci series in Java',
    content: `/**
 * Fibonacci.java
 * Generates the Fibonacci series using iterative and recursive methods.
 * Fibonacci: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, ...
 */
public class Fibonacci {

    // Recursive method — elegant but slower for large n
    public static long fibRecursive(int n) {
        if (n <= 1) return n;
        return fibRecursive(n - 1) + fibRecursive(n - 2);
    }

    // Iterative method — fast and efficient O(n)
    public static long fibIterative(int n) {
        if (n <= 1) return n;
        long prev = 0, curr = 1;
        for (int i = 2; i <= n; i++) {
            long next = prev + curr;
            prev = curr;
            curr = next;
        }
        return curr;
    }

    // Print the full Fibonacci series up to count terms
    public static void printSeries(int count) {
        System.out.print("Fibonacci Series (" + count + " terms): ");
        for (int i = 0; i < count; i++) {
            System.out.print(fibIterative(i));
            if (i < count - 1) System.out.print(", ");
        }
        System.out.println();
    }

    public static void main(String[] args) {

        System.out.println("=== Fibonacci Series ===");
        printSeries(15);

        System.out.println("\\n=== Individual Terms ===");
        int[] testCases = {0, 1, 5, 10, 15, 20};
        for (int n : testCases) {
            System.out.printf("fib(%2d) = %d%n", n, fibIterative(n));
        }

        System.out.println("\\n=== Recursive vs Iterative ===");
        for (int i = 0; i <= 10; i++) {
            long rec = fibRecursive(i);
            long ite = fibIterative(i);
            System.out.printf("fib(%2d): recursive=%d, iterative=%d, match=%b%n",
                i, rec, ite, rec == ite);
        }
    }
}
`,
  },

  // ── 4. Factorial ─────────────────────────────────────────────
  {
    patterns: [
      /factorial.*java/i,
      /java.*factorial/i,
      /Factorial\.java/i,
    ],
    filename: 'Factorial.java',
    description: 'Factorial program in Java',
    content: `/**
 * Factorial.java
 * Calculates factorial using iterative and recursive approaches.
 * factorial(n) = n * (n-1) * (n-2) * ... * 1
 * Example: factorial(5) = 5 * 4 * 3 * 2 * 1 = 120
 */
public class Factorial {

    // Iterative: O(n) time, O(1) space
    public static long factorialIterative(int n) {
        if (n < 0) throw new IllegalArgumentException("n must be >= 0");
        if (n == 0 || n == 1) return 1;
        long result = 1;
        for (int i = 2; i <= n; i++) {
            result *= i;
        }
        return result;
    }

    // Recursive: elegant, O(n) time, O(n) stack space
    public static long factorialRecursive(int n) {
        if (n < 0) throw new IllegalArgumentException("n must be >= 0");
        if (n == 0 || n == 1) return 1;
        return n * factorialRecursive(n - 1);
    }

    public static void main(String[] args) {

        System.out.println("=== Factorial Results ===");
        System.out.println(" n  | Iterative | Recursive");
        System.out.println("----|-----------|----------");

        for (int i = 0; i <= 12; i++) {
            long iterResult = factorialIterative(i);
            long recResult  = factorialRecursive(i);
            System.out.printf("%2d  | %9d | %9d%n", i, iterResult, recResult);
        }

        // Demonstrate individual call
        int n = 6;
        System.out.printf("%nfactorial(%d) step by step:%n", n);
        System.out.print(n + "! = ");
        for (int i = n; i >= 1; i--) {
            System.out.print(i);
            if (i > 1) System.out.print(" x ");
        }
        System.out.println(" = " + factorialIterative(n));
    }
}
`,
  },

  // ── 5. Palindrome ────────────────────────────────────────────
  {
    patterns: [
      /palindrome.*java/i,
      /java.*palindrome/i,
      /Palindrome\.java/i,
    ],
    filename: 'Palindrome.java',
    description: 'Palindrome check in Java',
    content: `/**
 * Palindrome.java
 * Checks whether a string or number is a palindrome.
 * A palindrome reads the same forwards and backwards.
 * Examples: "racecar", "madam", 121, 1221
 */
public class Palindrome {

    // Check if a string is a palindrome (case-insensitive, ignores spaces)
    public static boolean isStringPalindrome(String s) {
        // Clean input: lowercase, remove non-alphanumeric
        String cleaned = s.toLowerCase().replaceAll("[^a-z0-9]", "");
        int left = 0, right = cleaned.length() - 1;
        while (left < right) {
            if (cleaned.charAt(left) != cleaned.charAt(right)) return false;
            left++;
            right--;
        }
        return true;
    }

    // Check if a number is a palindrome
    public static boolean isNumberPalindrome(int n) {
        if (n < 0) return false;
        int original = n, reversed = 0;
        while (n > 0) {
            reversed = reversed * 10 + n % 10;
            n /= 10;
        }
        return original == reversed;
    }

    public static void main(String[] args) {

        // Test strings
        String[] words = {"racecar", "hello", "madam", "A man a plan a canal Panama",
                          "level", "world", "noon", "java"};

        System.out.println("=== String Palindrome Check ===");
        for (String word : words) {
            boolean result = isStringPalindrome(word);
            System.out.printf("%-35s -> %s%n", "\"" + word + "\"",
                result ? "✓ PALINDROME" : "✗ Not a palindrome");
        }

        // Test numbers
        int[] numbers = {121, 123, 1221, 12321, 10, 0, 1, 999};
        System.out.println("\\n=== Number Palindrome Check ===");
        for (int num : numbers) {
            System.out.printf("%6d -> %s%n", num,
                isNumberPalindrome(num) ? "✓ PALINDROME" : "✗ Not a palindrome");
        }
    }
}
`,
  },

  // ── 6. Bubble Sort ───────────────────────────────────────────
  {
    patterns: [
      /bubble.?sort.*java/i,
      /java.*bubble.?sort/i,
      /BubbleSort\.java/i,
    ],
    filename: 'BubbleSort.java',
    description: 'Bubble Sort algorithm in Java',
    content: `/**
 * BubbleSort.java
 * Implements the Bubble Sort algorithm with step-by-step visualization.
 * Time Complexity: O(n²) average/worst, O(n) best case (optimized)
 * Space Complexity: O(1) — sorts in place
 */
import java.util.Arrays;

public class BubbleSort {

    // Optimized bubble sort — stops early if already sorted
    public static void bubbleSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            boolean swapped = false;
            // Last i elements are already in place
            for (int j = 0; j < n - 1 - i; j++) {
                if (arr[j] > arr[j + 1]) {
                    // Swap arr[j] and arr[j+1]
                    int temp = arr[j];
                    arr[j]   = arr[j + 1];
                    arr[j + 1] = temp;
                    swapped = true;
                }
            }
            // If no swap occurred, array is already sorted
            if (!swapped) break;
        }
    }

    // Sort with pass-by-pass visualization
    public static void bubbleSortVerbose(int[] arr) {
        int n = arr.length;
        System.out.println("Initial array: " + Arrays.toString(arr));
        for (int i = 0; i < n - 1; i++) {
            boolean swapped = false;
            for (int j = 0; j < n - 1 - i; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = temp;
                    swapped = true;
                }
            }
            System.out.printf("Pass %d:        %s%n", i + 1, Arrays.toString(arr));
            if (!swapped) { System.out.println("Early exit — already sorted!"); break; }
        }
    }

    public static void main(String[] args) {

        // Demo 1: Show sorting steps
        System.out.println("=== Bubble Sort — Step by Step ===");
        int[] demo = {64, 34, 25, 12, 22, 11, 90};
        bubbleSortVerbose(demo);

        // Demo 2: Various test cases
        System.out.println("\\n=== Test Cases ===");
        int[][] tests = {
            {5, 1, 4, 2, 8},
            {1, 2, 3, 4, 5},          // Already sorted
            {5, 4, 3, 2, 1},          // Reverse sorted
            {3, 3, 3, 3},             // All same
            {42}                       // Single element
        };

        for (int[] arr : tests) {
            int[] copy = Arrays.copyOf(arr, arr.length);
            String before = Arrays.toString(copy);
            bubbleSort(copy);
            System.out.printf("Before: %-25s After: %s%n", before, Arrays.toString(copy));
        }
    }
}
`,
  },

  // ── 7. Binary Search ────────────────────────────────────────
  {
    patterns: [
      /binary.?search.*java/i,
      /java.*binary.?search/i,
      /BinarySearch\.java/i,
    ],
    filename: 'BinarySearch.java',
    description: 'Binary Search algorithm in Java',
    content: `/**
 * BinarySearch.java
 * Implements Binary Search — iterative and recursive versions.
 * Prerequisite: Array must be SORTED.
 * Time Complexity: O(log n)  |  Space: O(1) iterative, O(log n) recursive
 */
import java.util.Arrays;

public class BinarySearch {

    // Iterative binary search — returns index or -1 if not found
    public static int binarySearchIterative(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;  // avoids overflow
            if (arr[mid] == target)  return mid;
            else if (arr[mid] < target) left = mid + 1;
            else                        right = mid - 1;
        }
        return -1; // not found
    }

    // Recursive binary search
    public static int binarySearchRecursive(int[] arr, int target, int left, int right) {
        if (left > right) return -1;
        int mid = left + (right - left) / 2;
        if (arr[mid] == target)  return mid;
        if (arr[mid] < target)   return binarySearchRecursive(arr, target, mid + 1, right);
        return binarySearchRecursive(arr, target, left, mid - 1);
    }

    // Search with verbose step output
    public static void searchVerbose(int[] arr, int target) {
        System.out.printf("Searching for %d in %s%n", target, Arrays.toString(arr));
        int left = 0, right = arr.length - 1, step = 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            System.out.printf("  Step %d: left=%d, mid=%d, right=%d, arr[mid]=%d%n",
                step++, left, mid, right, arr[mid]);
            if (arr[mid] == target) {
                System.out.printf("  ✓ Found %d at index %d%n%n", target, mid);
                return;
            }
            if (arr[mid] < target) left = mid + 1;
            else                   right = mid - 1;
        }
        System.out.printf("  ✗ %d not found in array%n%n", target);
    }

    public static void main(String[] args) {

        int[] arr = {2, 5, 8, 12, 16, 23, 38, 45, 56, 72, 91};

        System.out.println("=== Binary Search — Step by Step ===");
        searchVerbose(arr, 23);
        searchVerbose(arr, 50);

        System.out.println("=== Iterative vs Recursive ===");
        int[] targets = {2, 45, 91, 30, 8};
        for (int t : targets) {
            int iter = binarySearchIterative(arr, t);
            int rec  = binarySearchRecursive(arr, t, 0, arr.length - 1);
            System.out.printf("target=%2d  iterative=%s  recursive=%s%n",
                t,
                iter  >= 0 ? "index " + iter  : "not found",
                rec   >= 0 ? "index " + rec   : "not found");
        }
    }
}
`,
  },

  // ── 8. Calculator ────────────────────────────────────────────
  {
    patterns: [
      /calculator.*java/i,
      /java.*calculator/i,
      /Calculator\.java/i,
      /simple.*calc.*java/i,
    ],
    filename: 'Calculator.java',
    description: 'Simple Calculator in Java',
    content: `/**
 * Calculator.java
 * A feature-rich console calculator supporting +, -, *, /, %, power.
 * Demonstrates: switch-case, methods, exception handling.
 */
public class Calculator {

    // Addition
    public static double add(double a, double b)      { return a + b; }

    // Subtraction
    public static double subtract(double a, double b)  { return a - b; }

    // Multiplication
    public static double multiply(double a, double b)  { return a * b; }

    // Division with zero-check
    public static double divide(double a, double b) {
        if (b == 0) throw new ArithmeticException("Cannot divide by zero!");
        return a / b;
    }

    // Modulus
    public static double modulus(double a, double b) {
        if (b == 0) throw new ArithmeticException("Cannot mod by zero!");
        return a % b;
    }

    // Power
    public static double power(double base, double exp) { return Math.pow(base, exp); }

    // Square root
    public static double squareRoot(double a) {
        if (a < 0) throw new ArithmeticException("Cannot take square root of negative!");
        return Math.sqrt(a);
    }

    // Perform calculation based on operator
    public static double calculate(double a, String op, double b) {
        switch (op) {
            case "+": return add(a, b);
            case "-": return subtract(a, b);
            case "*": return multiply(a, b);
            case "/": return divide(a, b);
            case "%": return modulus(a, b);
            case "^": return power(a, b);
            default:  throw new IllegalArgumentException("Unknown operator: " + op);
        }
    }

    public static void main(String[] args) {

        System.out.println("=== Java Calculator ===");
        System.out.println();

        // Demo calculations
        double[][] operands = {
            {10, 5}, {7, 3}, {6, 4}, {15, 3}, {17, 5}, {2, 8}
        };
        String[] operators = {"+", "-", "*", "/", "%", "^"};
        String[] opNames   = {"Addition", "Subtraction", "Multiplication",
                               "Division", "Modulus", "Power"};

        for (int i = 0; i < operators.length; i++) {
            double a = operands[i][0], b = operands[i][1];
            try {
                double result = calculate(a, operators[i], b);
                System.out.printf("%-14s : %.1f %s %.1f = %.4f%n",
                    opNames[i], a, operators[i], b, result);
            } catch (ArithmeticException e) {
                System.out.printf("%-14s : Error — %s%n", opNames[i], e.getMessage());
            }
        }

        System.out.println();
        System.out.printf("Square root of 144  = %.1f%n", squareRoot(144));
        System.out.printf("Square root of 2    = %.6f%n", squareRoot(2));
        System.out.printf("Pi value            = %.6f%n", Math.PI);
    }
}
`,
  },

  // ── 9. Linked List ───────────────────────────────────────────
  {
    patterns: [
      /linked.?list.*java/i,
      /java.*linked.?list/i,
      /LinkedList\.java/i,
      /LinkedListDemo\.java/i,
    ],
    filename: 'LinkedListDemo.java',
    description: 'Custom Linked List implementation in Java',
    content: `/**
 * LinkedListDemo.java
 * Custom Singly Linked List — insert, delete, search, reverse, print.
 * Demonstrates: inner classes, node pointers, list traversal.
 */
public class LinkedListDemo {

    // ── Node inner class ──
    static class Node {
        int data;
        Node next;
        Node(int data) { this.data = data; this.next = null; }
    }

    // ── LinkedList class ──
    static class LinkedList {
        Node head;
        int size;

        LinkedList() { head = null; size = 0; }

        // Insert at end — O(n)
        void insertEnd(int data) {
            Node newNode = new Node(data);
            if (head == null) { head = newNode; size++; return; }
            Node curr = head;
            while (curr.next != null) curr = curr.next;
            curr.next = newNode;
            size++;
        }

        // Insert at beginning — O(1)
        void insertFront(int data) {
            Node newNode = new Node(data);
            newNode.next = head;
            head = newNode;
            size++;
        }

        // Insert at position (0-indexed)
        void insertAt(int data, int pos) {
            if (pos <= 0)    { insertFront(data); return; }
            if (pos >= size) { insertEnd(data);   return; }
            Node newNode = new Node(data), curr = head;
            for (int i = 0; i < pos - 1; i++) curr = curr.next;
            newNode.next = curr.next;
            curr.next = newNode;
            size++;
        }

        // Delete by value — O(n)
        boolean delete(int data) {
            if (head == null) return false;
            if (head.data == data) { head = head.next; size--; return true; }
            Node curr = head;
            while (curr.next != null && curr.next.data != data) curr = curr.next;
            if (curr.next == null) return false;
            curr.next = curr.next.next;
            size--;
            return true;
        }

        // Search — O(n), returns index or -1
        int search(int data) {
            Node curr = head; int idx = 0;
            while (curr != null) {
                if (curr.data == data) return idx;
                curr = curr.next; idx++;
            }
            return -1;
        }

        // Reverse in place — O(n)
        void reverse() {
            Node prev = null, curr = head, next;
            while (curr != null) {
                next = curr.next;
                curr.next = prev;
                prev = curr;
                curr = next;
            }
            head = prev;
        }

        // Print list
        void print() {
            Node curr = head;
            System.out.print("HEAD -> ");
            while (curr != null) {
                System.out.print(curr.data + (curr.next != null ? " -> " : ""));
                curr = curr.next;
            }
            System.out.println(" -> NULL  (size=" + size + ")");
        }
    }

    public static void main(String[] args) {

        LinkedList list = new LinkedList();

        System.out.println("=== Linked List Demo ===\\n");

        // Insert elements
        System.out.println("-- Inserting 10, 20, 30, 40, 50 at end --");
        for (int v : new int[]{10, 20, 30, 40, 50}) list.insertEnd(v);
        list.print();

        System.out.println("\\n-- Insert 5 at front --");
        list.insertFront(5);
        list.print();

        System.out.println("\\n-- Insert 25 at position 3 --");
        list.insertAt(25, 3);
        list.print();

        System.out.println("\\n-- Search for 30 --");
        int idx = list.search(30);
        System.out.println("30 found at index: " + (idx >= 0 ? idx : "not found"));

        System.out.println("\\n-- Delete 20 --");
        list.delete(20);
        list.print();

        System.out.println("\\n-- Reverse the list --");
        list.reverse();
        list.print();
    }
}
`,
  },
];
